import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getNeighborhoodRiskData } from '../data/neighborhoodRiskData'
import { usePanelContext } from '../contexts/PanelContext'
import HeatmapLegend from './HeatmapLegend'
import CallsForServiceLegend from './CallsForServiceLegend'
import HeatHomelessnessLegend from './HeatHomelessnessLegend'
import DraggableFloatingPanel from './DraggableFloatingPanel'
import TemperatureLegend from './TemperatureLegend'
import overdoseData from '../data/baltimoreOverdoseData'
import naloxoneData from '../data/baltimoreNaloxoneData'
import { calculateNeighborhood311Density, getNeighborhoodColorExpression, getNeighborhoodBorderExpression } from '../utils/neighborhoodDensity'
import { getViewPreset } from '../config/viewPresets'
import { getTopNeighborhoods } from '../utils/neighborhoodStats'
import NeighborhoodStatsCard from './NeighborhoodStatsCard'
import NeighborhoodPin from './NeighborhoodPin'
import phoenixVillagesUrl from '../../External Datasets/Villages.geojson?url'
import phoenixCouncilDistrictsUrl from '../../External Datasets/Phoenix_Council_District.geojson?url'
import phoenixHomelessnessSyntheticPoints from '../data/phoenixHomelessnessSyntheticPoints.json'
import phoenixHeatDeathsByVillage from '../data/phoenixHeatDeathsByVillage.json'
import phoenixHeatDeathsDailyMultipliers from '../data/phoenixHeatDeathsDailyMultipliers.json'
import phoenixHeatIllnessesSyntheticDemo from '../data/phoenixHeatIllnessesSyntheticDemo.json'
import { buildPhoenixCoolingCentersGeojson, getPhoenixCoolingCentersHistoricalCoverage } from '../utils/phoenixCoolingCentersGeojson'
import {
  addMonths,
  fetchArchiveHourlyTemps,
  fetchForecastHourlyTemps,
  mergeHourlySeries,
} from '../utils/openMeteoHourlyTemps'
import { getPhoenixDistrictTempsCache, isForecastStale, setPhoenixDistrictTempsCache } from '../utils/phoenixDistrictTempsCache'
import { ensurePhoenixSituationalLayers, applyPhoenixSituationalLayers } from '../utils/phoenixSituationalAwarenessLayers'

function getGeojsonFeatureCenter(feature) {
  // Cheap center: bbox midpoint of all coordinates
  const coords = []
  const walk = (c) => {
    if (!c) return
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      coords.push(c)
      return
    }
    for (const cc of c) walk(cc)
  }
  walk(feature?.geometry?.coordinates)
  if (!coords.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of coords) {
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}

function getPolygonCentroidLngLat(feature) {
  // Best-effort centroid for Polygon/MultiPolygon in lon/lat.
  // Uses outer ring of the largest polygon by bbox area.
  const geom = feature?.geometry
  if (!geom) return null

  const ringCentroid = (ring) => {
    // ring: [[x,y],...], can be closed; compute planar centroid in lon/lat.
    if (!Array.isArray(ring) || ring.length < 3) return null
    let area2 = 0
    let cx = 0
    let cy = 0
    for (let i = 0; i < ring.length; i++) {
      const p0 = ring[i]
      const p1 = ring[(i + 1) % ring.length]
      const x0 = Number(p0?.[0]); const y0 = Number(p0?.[1])
      const x1 = Number(p1?.[0]); const y1 = Number(p1?.[1])
      if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) continue
      const a = x0 * y1 - x1 * y0
      area2 += a
      cx += (x0 + x1) * a
      cy += (y0 + y1) * a
    }
    if (!Number.isFinite(area2) || area2 === 0) return null
    const area6 = area2 * 3
    return [cx / area6, cy / area6]
  }

  const pickRing = () => {
    if (geom.type === 'Polygon') {
      return geom.coordinates?.[0] || null
    }
    if (geom.type === 'MultiPolygon') {
      const polys = Array.isArray(geom.coordinates) ? geom.coordinates : []
      // choose the first ring of the first polygon with coords
      for (const poly of polys) {
        const ring = poly?.[0]
        if (Array.isArray(ring) && ring.length >= 3) return ring
      }
    }
    return null
  }

  const ring = pickRing()
  const c = ring ? ringCentroid(ring) : null
  if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) return c
  return getGeojsonFeatureCenter(feature)
}

const pointInRing = (lng, lat, ring) => {
  // Ray casting; ring is a closed LineString: first point == last point (or not; both ok)
  if (!Array.isArray(ring) || ring.length < 3) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]
    const pj = ring[j]
    if (!Array.isArray(pi) || !Array.isArray(pj)) continue
    const xi = pi[0]
    const yi = pi[1]
    const xj = pj[0]
    const yj = pj[1]
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

const pointInPolygonRings = (lng, lat, rings) => {
  if (!Array.isArray(rings) || !rings.length) return false
  const outer = rings[0]
  if (!pointInRing(lng, lat, outer)) return false
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lng, lat, rings[i])) return false
  }
  return true
}

const buildPhoenixVillageCfsPrecomputed = (geojson) => {
  const features = geojson?.features || []
  const prepared = []
  for (const f of features) {
    const name = f?.properties?.NAME
    if (!name) continue
    const g = f?.geometry
    if (!g) continue

    const ringsList = []
    if (g.type === 'Polygon') {
      ringsList.push(g.coordinates || [])
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates || []) ringsList.push(poly)
    } else {
      continue
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const bump = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      minX = Math.min(minX, x); minY = Math.min(minY, y)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
    for (const rings of ringsList) {
      const outer = rings?.[0]
      if (!Array.isArray(outer)) continue
      for (const c of outer) {
        if (Array.isArray(c) && c.length >= 2) bump(c[0], c[1])
      }
    }
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) continue

    prepared.push({
      id: String(name),
      name: String(name),
      bbox: [minX, minY, maxX, maxY],
      ringsList,
    })
  }
  return prepared
}

const buildPhoenixCouncilDistrictCfsPrecomputed = (geojson) => {
  const features = geojson?.features || []
  const prepared = []
  for (const f of features) {
    const objectIdRaw = f?.properties?.OBJECTID ?? f?.id
    const objectId = objectIdRaw == null ? null : String(objectIdRaw)
    if (!objectId) continue
    const districtLabelRaw = f?.properties?.DISTRICT ?? f?.properties?.District ?? f?.properties?.district
    const districtLabel = String(districtLabelRaw ?? '').trim()

    const g = f?.geometry
    if (!g) continue

    const ringsList = []
    if (g.type === 'Polygon') {
      ringsList.push(g.coordinates || [])
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates || []) ringsList.push(poly)
    } else {
      continue
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const bump = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      minX = Math.min(minX, x); minY = Math.min(minY, y)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
    for (const rings of ringsList) {
      const outer = rings?.[0]
      if (!Array.isArray(outer)) continue
      for (const c of outer) {
        if (Array.isArray(c) && c.length >= 2) bump(c[0], c[1])
      }
    }
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) continue

    prepared.push({
      id: objectId,
      districtLabel,
      bbox: [minX, minY, maxX, maxY],
      ringsList,
    })
  }
  return prepared
}

const countPointsInVillages = (points, precomputed) => {
  const counts = new Map()
  const byType = new Map() // villageId -> Map(finalCallType -> count)
  for (const p of precomputed) {
    counts.set(p.id, 0)
    byType.set(p.id, new Map())
  }

  for (const f of points) {
    if (f?.geometry?.type !== 'Point') continue
    const c = f.geometry.coordinates
    if (!Array.isArray(c) || c.length < 2) continue
    const lng = c[0]
    const lat = c[1]
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue

    const callType = String(f?.properties?.finalCallType || '').trim() || 'Unknown'

    for (const v of precomputed) {
      const [minX, minY, maxX, maxY] = v.bbox
      if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue
      let hit = false
      for (const rings of v.ringsList) {
        if (pointInPolygonRings(lng, lat, rings)) {
          hit = true
          break
        }
      }
      if (!hit) continue
      counts.set(v.id, (counts.get(v.id) || 0) + 1)
      const inner = byType.get(v.id) || new Map()
      inner.set(callType, (inner.get(callType) || 0) + 1)
      byType.set(v.id, inner)
      break
    }
  }
  return { counts, byType }
}

const MAPTILER_API_KEY = 'X1kjwlVN29N1UZItdixx'

function createZoomPercentControl({ minZoom = 8, maxZoom = 18, maxPercent = 200 } = {}) {
  let map = null
  let container = null
  let percentLabel = null

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
  const zoomToPercent = (zoom) => {
    const ratio = (zoom - minZoom) / Math.max(0.0001, (maxZoom - minZoom))
    return Math.round(clamp(ratio, 0, 1) * maxPercent)
  }
  const percentToZoom = (percent) => {
    const ratio = clamp(percent, 0, maxPercent) / maxPercent
    return minZoom + ratio * (maxZoom - minZoom)
  }

  const syncPercentFromMap = () => {
    if (!map || !percentLabel) return
    percentLabel.textContent = `${zoomToPercent(map.getZoom())}%`
  }

  return {
    onAdd(nextMap) {
      map = nextMap
      container = document.createElement('div')
      container.className = 'maplibregl-ctrl custom-zoom-control'

      const makeButton = (label, ariaLabel, onClick, extraClass = '') => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `custom-zoom-control__btn ${extraClass}`.trim()
        button.setAttribute('aria-label', ariaLabel)
        button.textContent = label
        button.addEventListener('click', onClick)
        return button
      }

      const zoomButton = document.createElement('button')
      zoomButton.type = 'button'
      zoomButton.className = 'custom-zoom-control__value-wrap'
      zoomButton.setAttribute('aria-label', 'Set zoom percent')

      percentLabel = document.createElement('span')
      percentLabel.className = 'custom-zoom-control__label'
      percentLabel.textContent = `${zoomToPercent(map.getZoom())}%`

      const setPercent = (value) => {
        if (!map) return
        const parsed = Number(value)
        if (Number.isNaN(parsed)) {
          syncPercentFromMap()
          return
        }
        const clampedPercent = clamp(Math.round(parsed), 0, maxPercent)
        map.easeTo({ zoom: percentToZoom(clampedPercent) })
      }

      zoomButton.addEventListener('click', () => {
        const currentPercent = zoomToPercent(map.getZoom())
        const raw = window.prompt('Set zoom percent (0-200)', String(currentPercent))
        if (raw === null) return
        setPercent(raw)
      })

      const zoomOutButton = makeButton('−', 'Zoom out', () => map?.easeTo({ zoom: map.getZoom() - 1 }))
      const zoomInButton = makeButton('+', 'Zoom in', () => map?.easeTo({ zoom: map.getZoom() + 1 }))

      zoomButton.appendChild(percentLabel)

      container.appendChild(zoomButton)
      container.appendChild(zoomOutButton)
      container.appendChild(zoomInButton)

      map.on('zoom', syncPercentFromMap)
      return container
    },
    onRemove() {
      if (map) {
        map.off('zoom', syncPercentFromMap)
      }
      if (container?.parentNode) {
        container.parentNode.removeChild(container)
      }
      map = null
      container = null
      percentLabel = null
    },
  }
}

// ArcGIS Feature Service URL pattern for Baltimore 311 by year
// Now accepts an optional endDate parameter to filter on the server side
const get311ServiceUrl = (year, endDate = null) => {
  let whereClause = '1%3D1' // Default: where 1=1 (all records)
  
  if (endDate) {
    // Filter on server side using ArcGIS DATE syntax
    // This ensures we only fetch relevant records instead of filtering client-side
    const endOfDay = new Date(endDate)
    endOfDay.setHours(23, 59, 59, 999)
    
    // Format: DATE 'YYYY-MM-DD HH:MM:SS'
    const yyyy = endOfDay.getFullYear()
    const mm = String(endOfDay.getMonth() + 1).padStart(2, '0')
    const dd = String(endOfDay.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd} 23:59:59`
    
    // URL encode: CreatedDate <= DATE 'YYYY-MM-DD 23:59:59'
    whereClause = `CreatedDate+%3C%3D+DATE+'${dateStr}'`
  }
  
  return `https://services1.arcgis.com/UWYHeuuJISiGmgXx/arcgis/rest/services/311_Customer_Service_Requests_${year}/FeatureServer/0/query` +
    `?where=${whereClause}&outFields=SRType,Agency,SRStatus,CreatedDate,CloseDate,Address,Neighborhood` +
    `&f=geojson&resultRecordCount=15000`
}

// Neighborhood boundary data: © City of St. Louis, provided by SLU OpenGIS (CC-BY-4.0)
// https://github.com/slu-openGIS/STL_BOUNDARY_Nhood
// NOTE: Forked from MapView.jsx so the City Risk & Resilience page can be
// edited independently of the default Map View without conditional spaghetti.
// Keep this component standalone (do not import MapView here).
export default function RiskMapView() {
  const { 
    selectedCity,
    mapLibreColors,
    neighborhoodsRiskVisible, 
    baltimoreNeighborhoodsData,
    setBaltimoreNeighborhoodsData,
    baltimoreNeighborhoodsAffected,
    baltimoreNeighborhoodsAll,
    phoenixNeighborhoodBoundariesVisible,
    phoenixVillagesGeojson,
    phoenixVillagesEnabled,
    phoenixVillagesCfsRagVisible,
    phoenixCouncilDistrictsCfsRagVisible,
    phoenixCouncilDistrictBoundariesVisible,
    phoenixCouncilDistrictsGeojson,
    phoenixCouncilDistrictsEnabled,
    phoenixHomelessnessAffectedNeighborhoodsVisible,
    phoenixTemperatureNeighborhoodsVisible,
    phoenixTemperatureNeighborhoodsLabelsVisible,
    phoenixHeatDeathsVisible,
    phoenixHeatDeathsLabelsVisible,
    phoenixHeatIllnessesVisible,
    phoenixCoolingCentersVisible,
    phoenixHeatIllnessesEnabled,
    phoenixHeatIllnessesTimeMode,
    phoenixHeatIllnessesGranularity,
    phoenixHeatIllnessesGeoView,
    phoenixCoolingCentersGeoView,
    phoenixHeatIllnessGeoLabelsVisible,
    callsForServiceVisible,
    callsForServiceStyle,
    callsForServiceTypes,
    callsForServiceGeojson,
    phoenixHomelessnessVisible,
    phoenixActiveMasterLayer,
    phoenixSituationalAwareness,
    phoenixHomelessnessSnapshot,
    phoenixHomelessnessCategoryEnabled,
    phoenixCallsForServiceMinDate,
    phoenixCallsForServiceMaxDate,
    baltimore311Visible, 
    baltimore311Style, 
    baltimore311Clustered, 
    baltimore311HideClosed,
    baltimore311Types, 
    selectedYear, 
    selectedDate, 
    setBaltimore311Data, 
    setBaltimore311DataYear, 
    mapFocusRequest,
    mapPopupRequest,
    heatmapConfig,
    healthOverdoseVisible,
    healthNaloxoneVisible,
    healthOverdoseFilters,
    healthNaloxoneFilters,
    setHealthOverdoseData,
    setHealthNaloxoneData,
    setHealthDataYear,
  } = usePanelContext()
  const mapContainer = useRef(null)
  const basemapPaintOriginalRef = useRef(null) // Map(layerId -> Map(paintProp -> originalValue))
  const map = useRef(null)
  const mapLib = useRef(null) // Store reference to the map library (maplibregl or mapboxgl)
  const neighborhoodMarkers = useRef([]) // Store { pin: Marker, card: Marker, name: string }
  const [mapLoaded, setMapLoaded] = useState(false)
  const [minimizedCards, setMinimizedCards] = useState({}) // Track which cards are minimized by neighborhood name
  const [currentEngine, setCurrentEngine] = useState('maplibre') // Track which engine is currently loaded
  // Cache fetched 311 GeoJSON per year+date combination to avoid redundant requests
  // Key format: "YYYY-MM-DD" for specific dates, or "YYYY" for year-end
  const baltimore311Cache = useRef({})
  const phoenixVillagesCache = useRef(null)
  const phoenixCouncilDistrictsCache = useRef(null)
  const phoenixCouncilDistrictHoverId = useRef(null)
  const phoenixCouncilDistrictSelectedId = useRef(null)
  const phoenixVillageHoverId = useRef(null)
  const phoenixVillageSelectedId = useRef(null)
  const phoenixHeatIllnessesPopup = useRef(null)
  const phoenixHeatIllnessHoverId = useRef(null)
  const phoenixVillagesCfsRagPopup = useRef(null)
  const phoenixVillagesCfsRagHoverId = useRef(null)
  const phoenixVillagesCfsPrepared = useRef(null) // { key, prepared }
  const phoenixCouncilDistrictsCfsRagPopup = useRef(null)
  const phoenixCouncilDistrictsCfsRagHoverId = useRef(null)
  const phoenixCouncilDistrictsCfsPrepared = useRef(null) // { key, prepared }
  const phoenixVillageToCouncilDistrictRef = useRef(null) // { key, map: Map(villageName -> districtLabel) }
  const phoenixVillageHourlyTempsCache = useRef(new Map()) // name -> { times: string[], tempsC: number[] }
  const phoenixHeatDeathsLabelMarkersRef = useRef([]) // Array<maplibre Marker>
  const phoenixHomelessnessSnapshotRef = useRef(null)
  const phoenixHomelessnessCategoryEnabledRef = useRef({})
  const phoenixTemperatureNeighborhoodsLabelsVisibleRef = useRef(false)
  const phoenixHeatDeathsLabelsVisibleRef = useRef(false)

  const [phoenixHeatDeathsTimeline, setPhoenixHeatDeathsTimeline] = useState({ status: 'idle', months: [], idx: 6 })
  const phoenixHeatDeathsDragRef = useRef({ dragging: false })
  const phoenixHeatDeathsRailRef = useRef(null)
  const phoenixHeatDeathsDateInputRef = useRef(null)
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200))
  const [phoenixCoolingCentersCoverage, setPhoenixCoolingCentersCoverage] = useState(null)

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    phoenixHomelessnessSnapshotRef.current = phoenixHomelessnessSnapshot
  }, [phoenixHomelessnessSnapshot])

  useEffect(() => {
    phoenixHomelessnessCategoryEnabledRef.current = phoenixHomelessnessCategoryEnabled || {}
  }, [phoenixHomelessnessCategoryEnabled])

  useEffect(() => {
    phoenixTemperatureNeighborhoodsLabelsVisibleRef.current = !!phoenixTemperatureNeighborhoodsLabelsVisible
  }, [phoenixTemperatureNeighborhoodsLabelsVisible])

  useEffect(() => {
    phoenixHeatDeathsLabelsVisibleRef.current = !!phoenixHeatDeathsLabelsVisible
  }, [phoenixHeatDeathsLabelsVisible])

  const create311PopupHtml = (properties = {}) => {
    const { SRType, Address, SRStatus, CreatedDate, CloseDate, Agency, Neighborhood } = properties
    const asOfDate = new Date(selectedDate)
    asOfDate.setHours(23, 59, 59, 999)
    const asOfTime = asOfDate.getTime()

    let historicalStatus = 'Open'
    if (CloseDate && CloseDate <= asOfTime) {
      historicalStatus = 'Closed'
    }

    return `
      <div style="font-size:13px;line-height:1.5;color:rgba(255,255,255,0.9);min-width:200px">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px">311 Service Request</div>
        <div style="font-weight:600;font-size:14px;color:#fff;margin-bottom:6px;line-height:1.3">${SRType || 'Service Request'}</div>
        ${Address ? `
          <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-bottom:2px">${Address}${Neighborhood ? `<span style="color:rgba(255,255,255,0.35)"> · ${Neighborhood}</span>` : ''}</div>
        ` : ''}
        ${Agency ? `
          <div style="color:rgba(255,255,255,0.4);font-size:12px;margin-bottom:6px">${Agency}</div>
        ` : ''}
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08)">
          <span style="
            display:inline-flex;align-items:center;gap:4px;
            padding:2px 8px;border-radius:5px;font-size:11px;font-weight:500;
            background:${historicalStatus === 'Open' ? 'rgba(249,115,22,0.15)' : 'rgba(127,190,72,0.15)'};
            color:${historicalStatus === 'Open' ? '#fb923c' : '#86efac'};
            border:1px solid ${historicalStatus === 'Open' ? 'rgba(249,115,22,0.35)' : 'rgba(127,190,72,0.35)'};
          ">
            <span style="width:5px;height:5px;border-radius:50%;background:currentColor;display:inline-block"></span>
            ${historicalStatus}
          </span>
        </div>
      </div>
    `
  }

  const cityConfig = {
    stl: { center: [-90.1994, 38.6270], zoom: 11 },
    baltimore: { center: [-76.6122, 39.2904], zoom: 11 },
    howard: { center: [-76.8758, 39.2037], zoom: 11 }, // Howard County, MD
    phoenix: { center: [-112.0740, 33.4484], zoom: 9.5 },
  }

  // Get active color scheme (MapLibre-only)
  const getActiveColors = () => mapLibreColors

  // Get map style URL (MapLibre-only)
  const getMapStyle = () => `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_API_KEY}`

  // Initialize map (MapLibre-only)
  useEffect(() => {
    const initMap = async () => {
      let savedState = null
      if (map.current) {
        savedState = {
          center: map.current.getCenter(),
          zoom: map.current.getZoom(),
        }
        map.current.remove()
        map.current = null
        setMapLoaded(false)
      }

      // Skip if map already exists
      if (map.current) return

      // Get view preset for this city (MapLibre)
      const preset = getViewPreset(selectedCity, 'maplibre')
      const cfg = cityConfig[selectedCity] || cityConfig.stl
      
      console.log('🎯 Map init - getting preset:', { selectedCity, preset, cfg })

      const mapgl = maplibregl

      // Store library reference for popup creation
      mapLib.current = mapgl

      // Determine camera position:
      // - If we have a preset for this city+engine, use it (ignores saved state)
      // - Otherwise use saved state from engine switch
      // - Finally fall back to basic config
      const center = preset?.center || savedState?.center || cfg.center
      const zoom = preset?.zoom || savedState?.zoom || cfg.zoom
      const pitch = preset?.pitch ?? 0
      const bearing = preset?.bearing ?? 0

      console.log('🗺️ Initializing map:', { selectedCity, usingPreset: !!preset, center, zoom, pitch, bearing })

      map.current = new mapgl.Map({
        container: mapContainer.current,
        style: getMapStyle(),
        center,
        zoom,
        pitch,
        bearing,
        minZoom: 8,
        maxZoom: 18,
        attributionControl: true,
        customAttribution: 'Neighborhood boundaries © City of St. Louis / SLU OpenGIS',
      })

      map.current.addControl(
        createZoomPercentControl({ minZoom: 8, maxZoom: 18, maxPercent: 200 }),
        'bottom-right'
      )

      map.current.on('load', () => {
      // Find first symbol layer in the style (for proper layer ordering)
      const layers = map.current.getStyle().layers
      let firstSymbolId
      for (const layer of layers) {
        if (layer.type === 'symbol') {
          firstSymbolId = layer.id
          break
        }
      }

      // Helper function to force paint properties (override Mapbox style defaults)
      const forcePaintProperty = (layerId, property, value) => {
        if (map.current.getLayer(layerId)) {
          map.current.setPaintProperty(layerId, property, value)
        }
      }

      // Neighborhood risk polygons source + layers
      map.current.addSource('neighborhood-risk', {
        type: 'geojson',
        data: getNeighborhoodRiskData(),
      })

      map.current.addLayer({
        id: 'neighborhood-risk-fill',
        type: 'fill',
        source: 'neighborhood-risk',
        paint: {
          'fill-color': [
            'match', ['get', 'riskLevel'],
            'high',   'rgba(212, 51, 59, 0.4)',
            'medium', 'rgba(241, 167, 40, 0.4)',
            'low',    'rgba(127, 190, 72, 0.4)',
                      'rgba(158, 158, 158, 0.2)',
          ],
          'fill-opacity': 0.6,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'neighborhood-risk-border',
        type: 'line',
        source: 'neighborhood-risk',
        paint: {
          'line-color': [
            'match', ['get', 'riskLevel'],
            'high',   'rgb(212, 51, 59)',
            'medium', 'rgb(241, 167, 40)',
            'low',    'rgb(127, 190, 72)',
                      'rgb(158, 158, 158)',
          ],
          'line-width': 2,
          'line-opacity': 0.8,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Baltimore neighborhood boundaries (loaded from server - no optimization)
      map.current.addSource('baltimore-neighborhoods', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.current.addLayer({
        id: 'baltimore-neighborhoods-fill',
        type: 'fill',
        source: 'baltimore-neighborhoods',
        paint: {
          'fill-color': 'rgba(59, 130, 246, 0.12)',
          'fill-opacity': 0.6,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'baltimore-neighborhoods-border',
        type: 'line',
        source: 'baltimore-neighborhoods',
        paint: {
          'line-color': 'rgb(59, 130, 246)',
          'line-width': 1.5,
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'baltimore-neighborhoods-labels',
        type: 'symbol',
        source: 'baltimore-neighborhoods',
        layout: {
          'text-field': ['get', 'Name'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-max-width': 8,
          'visibility': 'none',
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.85)',
          'text-halo-width': 2.5,
          'text-opacity': 0.95,
        },
      }, firstSymbolId)

      // Phoenix village boundaries (loaded from local GeoJSON)
      map.current.addSource('phoenix-villages', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'NAME',
      })

      map.current.addSource('phoenix-council-districts', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'OBJECTID',
      })

      map.current.addSource('phoenix-council-districts-heatillness', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'OBJECTID',
      })

      // Phoenix villages colored by heat illnesses (derived from council-district totals)
      map.current.addSource('phoenix-villages-heatillness', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'NAME',
      })

      // Phoenix villages colored by homelessness severity (derived — legacy, kept for back-compat)
      map.current.addSource('phoenix-villages-homelessness', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'NAME',
      })

      // Phoenix council districts colored by homelessness severity (derived; point-in-polygon)
      map.current.addSource('phoenix-council-districts-homelessness', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'OBJECTID',
      })

      // Phoenix council districts colored by temperature (derived; citywide value projected to districts)
      map.current.addSource('phoenix-council-districts-temperature', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'OBJECTID',
      })

      // Phoenix villages colored by heat deaths (example metric; derived)
      map.current.addSource('phoenix-villages-heatdeaths', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'NAME',
      })

      // Phoenix villages colored by Calls for Service counts (derived; point-in-polygon)
      map.current.addSource('phoenix-villages-cfs-rag', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'NAME',
      })

      // Phoenix council districts colored by Calls for Service counts (derived; point-in-polygon)
      map.current.addSource('phoenix-council-districts-cfs-rag', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'OBJECTID',
      })

      // Phoenix villages colored by Cooling Centers density (derived; point-in-polygon)
      map.current.addSource('phoenix-villages-cooling-centers-rag', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'NAME',
      })

      // Phoenix council districts colored by Cooling Centers density (derived; point-in-polygon)
      map.current.addSource('phoenix-council-districts-cooling-centers-rag', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'OBJECTID',
      })

      // Phoenix cooling centers (points)
      map.current.addSource('phoenix-cooling-centers', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        // Always show individual centers (no clustering).
      })

      map.current.addLayer({
        id: 'phoenix-cooling-centers-clusters',
        type: 'circle',
        source: 'phoenix-cooling-centers',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'rgba(46, 185, 194, 0.85)',
          'circle-stroke-color': 'rgba(255,255,255,0.75)',
          'circle-stroke-width': 1,
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            12, 10,
            16, 25,
            20,
          ],
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-cooling-centers-cluster-count',
        type: 'symbol',
        source: 'phoenix-cooling-centers',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'visibility': 'none',
        },
        paint: {
          'text-color': '#0b0f14',
        },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-cooling-centers-points',
        type: 'circle',
        source: 'phoenix-cooling-centers',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': 'rgba(46, 185, 194, 0.95)',
          'circle-stroke-color': 'rgba(255,255,255,0.85)',
          'circle-stroke-width': 1.25,
          'circle-radius': 6,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-villages-fill',
        type: 'fill',
        source: 'phoenix-villages',
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            'rgba(59,130,246,0.26)',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(59,130,246,0.18)',
            'rgba(59,130,246,0.10)',
          ],
          'fill-opacity': 0.55,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-villages-border',
        type: 'line',
        source: 'phoenix-villages',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            'rgba(255,255,255,0.90)',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.65)',
            'rgb(59,130,246)',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            3,
            ['boolean', ['feature-state', 'hover'], false],
            2.2,
            1.6,
          ],
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-villages-labels',
        type: 'symbol',
        source: 'phoenix-villages',
        layout: {
          'text-field': ['get', 'NAME'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-max-width': 10,
          'visibility': 'none',
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.85)',
          'text-halo-width': 2.5,
          'text-opacity': 0.95,
        },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-villages-homelessness-fill',
        type: 'fill',
        source: 'phoenix-villages-homelessness',
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 'rgba(255,255,255,0.92)',
            ['boolean', ['feature-state', 'hover'], false], 'rgba(255,255,255,0.88)',
            [
              'interpolate',
              ['linear'],
              ['get', 'homelessCount'],
              0, 'rgba(156, 163, 175, 0.20)', // gray
              10, 'rgba(250, 204, 21, 0.28)', // yellow
              25, 'rgba(245, 158, 11, 0.34)', // amber
              50, 'rgba(239, 68, 68, 0.40)',  // red
            ],
          ],
          'fill-opacity': 0.85,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-villages-homelessness-border',
        type: 'line',
        source: 'phoenix-villages-homelessness',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 'rgba(255,255,255,0.95)',
            ['boolean', ['feature-state', 'hover'], false], 'rgba(255,255,255,0.85)',
            'rgba(255,255,255,0.25)',
          ],
          'line-width': [
            'case',
            ['any', ['boolean', ['feature-state', 'selected'], false], ['boolean', ['feature-state', 'hover'], false]],
            2.5,
            1.5,
          ],
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-council-districts-homelessness-fill',
        type: 'fill',
        source: 'phoenix-council-districts-homelessness',
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 'rgba(255,255,255,0.92)',
            ['boolean', ['feature-state', 'hover'], false], 'rgba(255,255,255,0.88)',
            [
              'interpolate',
              ['linear'],
              ['get', 'homelessCount'],
              0,  'rgba(156, 163, 175, 0.20)',
              10, 'rgba(250, 204, 21,  0.28)',
              25, 'rgba(245, 158, 11,  0.34)',
              50, 'rgba(239,  68,  68, 0.40)',
            ],
          ],
          'fill-opacity': 0.85,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-council-districts-homelessness-border',
        type: 'line',
        source: 'phoenix-council-districts-homelessness',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 'rgba(255,255,255,0.95)',
            ['boolean', ['feature-state', 'hover'], false], 'rgba(255,255,255,0.85)',
            'rgba(255,255,255,0.25)',
          ],
          'line-width': [
            'case',
            ['any', ['boolean', ['feature-state', 'selected'], false], ['boolean', ['feature-state', 'hover'], false]],
            2.5,
            1.5,
          ],
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-council-districts-temperature-fill',
        type: 'fill',
        source: 'phoenix-council-districts-temperature',
        paint: {
          'fill-color': [
            'case',
            ['!', ['has', 'tempF']], 'rgba(156, 163, 175, 0.80)',
            ['==', ['get', 'tempF'], null], 'rgba(156, 163, 175, 0.80)',
            [
              'interpolate',
              ['linear'],
              ['to-number', ['get', 'tempF']],
              // °F scale (standard legend)
              -40, 'rgba(242, 242, 242, 0.80)',
              -30, 'rgba(242, 154, 194, 0.80)',
              -20, 'rgba(217, 76, 154, 0.80)',
              -10, 'rgba(166, 51, 166, 0.80)',
              0, 'rgba(106, 58, 166, 0.80)',
              10, 'rgba(61, 58, 166, 0.80)',
              20, 'rgba(43, 115, 210, 0.80)',
              30, 'rgba(31, 191, 154, 0.80)',
              40, 'rgba(63, 191, 74, 0.80)',
              50, 'rgba(183, 225, 58, 0.80)',
              60, 'rgba(242, 230, 70, 0.80)',
              70, 'rgba(242, 178, 31, 0.80)',
              80, 'rgba(242, 106, 42, 0.80)',
              90, 'rgba(227, 58, 42, 0.80)',
              100, 'rgba(198, 27, 31, 0.80)',
              120, 'rgba(91, 15, 20, 0.80)',
            ],
          ],
          'fill-opacity': 0.85,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-council-districts-temperature-border',
        type: 'line',
        source: 'phoenix-council-districts-temperature',
        paint: {
          'line-color': 'rgba(255,255,255,0.25)',
          'line-width': 1.5,
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-villages-heatdeaths-fill',
        type: 'fill',
        source: 'phoenix-villages-heatdeaths',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['to-number', ['coalesce', ['get', 'heatDeaths'], 0]],
            0, 'rgba(156, 163, 175, 0.20)', // gray
            5, 'rgba(250, 204, 21, 0.28)', // yellow
            12, 'rgba(245, 158, 11, 0.34)', // amber
            25, 'rgba(239, 68, 68, 0.40)',  // red
          ],
          'fill-opacity': 0.85,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-villages-heatdeaths-border',
        type: 'line',
        source: 'phoenix-villages-heatdeaths',
        paint: {
          'line-color': 'rgba(255,255,255,0.25)',
          'line-width': 1.5,
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-villages-cfs-rag-fill',
        type: 'fill',
        source: 'phoenix-villages-cfs-rag',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'cfsCount'], 0],
            0, 'rgba(34,197,94,0.50)',     // green
            50, 'rgba(234,179,8,0.50)',    // yellow
            150, 'rgba(245,158,11,0.50)',  // amber
            250, 'rgba(245,158,11,0.50)',  // deep amber
            400, 'rgba(249,115,22,0.50)',  // orange-red
            700, 'rgba(239,68,68,0.50)',   // red
          ],
          'fill-outline-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.75)',
            'rgba(255,255,255,0.25)',
          ],
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-villages-cfs-rag-border',
        type: 'line',
        source: 'phoenix-villages-cfs-rag',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.85)',
            'rgba(255,255,255,0.30)',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2.75,
            1.5,
          ],
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-council-districts-cfs-rag-fill',
        type: 'fill',
        source: 'phoenix-council-districts-cfs-rag',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'cfsCount'], 0],
            0, 'rgba(34,197,94,0.50)',     // green
            50, 'rgba(234,179,8,0.50)',    // yellow
            150, 'rgba(245,158,11,0.50)',  // amber
            250, 'rgba(245,158,11,0.50)',  // deep amber
            400, 'rgba(249,115,22,0.50)',  // orange-red
            700, 'rgba(239,68,68,0.50)',   // red
          ],
          'fill-outline-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.75)',
            'rgba(255,255,255,0.25)',
          ],
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-council-districts-cfs-rag-border',
        type: 'line',
        source: 'phoenix-council-districts-cfs-rag',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.85)',
            'rgba(255,255,255,0.30)',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2.75,
            1.5,
          ],
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-villages-cooling-centers-rag-fill',
        type: 'fill',
        source: 'phoenix-villages-cooling-centers-rag',
        paint: {
          'fill-color': [
            'case',
            ['<=', ['to-number', ['coalesce', ['get', 'ccCount'], 0]], 0],
            'rgba(82,82,91,0.35)', // no centers
            [
              'interpolate',
              ['linear'],
              ['to-number', ['coalesce', ['get', 'ccScore'], 0]],
              0, 'rgba(239,68,68,0.45)',    // red (low density)
              0.5, 'rgba(245,158,11,0.45)',  // amber
              0.8, 'rgba(234,179,8,0.45)',   // yellow
              1, 'rgba(34,197,94,0.45)',     // green (high density)
            ],
          ],
          'fill-outline-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.75)',
            'rgba(255,255,255,0.25)',
          ],
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-villages-cooling-centers-rag-border',
        type: 'line',
        source: 'phoenix-villages-cooling-centers-rag',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.85)',
            'rgba(255,255,255,0.30)',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2.75,
            1.5,
          ],
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-council-districts-cooling-centers-rag-fill',
        type: 'fill',
        source: 'phoenix-council-districts-cooling-centers-rag',
        paint: {
          'fill-color': [
            'case',
            ['<=', ['to-number', ['coalesce', ['get', 'ccCount'], 0]], 0],
            'rgba(82,82,91,0.35)', // no centers
            [
              'interpolate',
              ['linear'],
              ['to-number', ['coalesce', ['get', 'ccScore'], 0]],
              0, 'rgba(239,68,68,0.45)',    // red (low density)
              0.5, 'rgba(245,158,11,0.45)',  // amber
              0.8, 'rgba(234,179,8,0.45)',   // yellow
              1, 'rgba(34,197,94,0.45)',     // green (high density)
            ],
          ],
          'fill-outline-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.75)',
            'rgba(255,255,255,0.25)',
          ],
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-council-districts-cooling-centers-rag-border',
        type: 'line',
        source: 'phoenix-council-districts-cooling-centers-rag',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.85)',
            'rgba(255,255,255,0.30)',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2.75,
            1.5,
          ],
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Ensure cooling center points draw above choropleths.
      try {
        if (map.current.getLayer('phoenix-cooling-centers-clusters')) map.current.moveLayer('phoenix-cooling-centers-clusters', firstSymbolId)
        if (map.current.getLayer('phoenix-cooling-centers-cluster-count')) map.current.moveLayer('phoenix-cooling-centers-cluster-count', firstSymbolId)
        if (map.current.getLayer('phoenix-cooling-centers-points')) map.current.moveLayer('phoenix-cooling-centers-points', firstSymbolId)
      } catch {
        // ignore move failures (layer may not exist yet in some init paths)
      }

      map.current.addLayer({
        id: 'phoenix-council-districts-temperature-labels',
        type: 'symbol',
        source: 'phoenix-council-districts-temperature',
        layout: {
          'text-field': [
            'case',
            ['any', ['!', ['has', 'tempF']], ['==', ['get', 'tempF'], null], ['!', ['has', 'DISTRICT']]],
            '',
            ['concat', 'District ', ['to-string', ['get', 'DISTRICT']], ' · ', ['to-string', ['get', 'tempF']], '°F'],
          ],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 15,
          // Let MapLibre try alternate placements before dropping labels due to collisions.
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
          'text-radial-offset': 0.6,
          'text-padding': 1,
          // Only 8 labels: always show (avoid “missing District 8” due to collisions).
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'visibility': 'none',
        },
        paint: {
          'text-color': 'rgba(255,255,255,0.92)',
          'text-halo-color': 'rgba(0,0,0,0.75)',
          'text-halo-width': 2,
          'text-opacity': 0.95,
        },
      }, firstSymbolId)

      // Phoenix Calls for Service (points derived from CSV + geocoding)
      map.current.addSource('phoenix-cfs-clustered', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      })

      map.current.addLayer({
        id: 'phoenix-council-districts-fill',
        type: 'fill',
        source: 'phoenix-council-districts',
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            'rgba(59,130,246,0.28)',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(59,130,246,0.20)',
            'rgba(59,130,246,0.10)',
          ],
          'fill-outline-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            'rgba(255,255,255,0.85)',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.55)',
            'rgba(59,130,246,0.50)',
          ],
        },
        layout: { visibility: 'none' },
      })

      map.current.addLayer({
        id: 'phoenix-council-districts-border',
        type: 'line',
        source: 'phoenix-council-districts',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            'rgba(255,255,255,0.90)',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.65)',
            'rgba(59,130,246,0.55)',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            3,
            ['boolean', ['feature-state', 'hover'], false],
            2.25,
            1.5,
          ],
        },
        layout: { visibility: 'none' },
      })

      map.current.addLayer({
        id: 'phoenix-council-districts-labels',
        type: 'symbol',
        source: 'phoenix-council-districts',
        layout: {
          visibility: 'none',
          'text-field': ['concat', 'District ', ['get', 'DISTRICT']],
          'text-size': 15,
          'text-font': ['Open Sans Bold'],
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
          'text-radial-offset': 0.6,
          'text-padding': 1,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': 'rgba(255,255,255,0.88)',
          'text-halo-color': 'rgba(0,0,0,0.55)',
          'text-halo-width': 1.2,
        },
      })

      // Situational Awareness View highlight layers (heat / 311 / housing / econ).
      ensurePhoenixSituationalLayers(map.current)

      map.current.addLayer({
        id: 'phoenix-council-districts-heatillness-fill',
        type: 'fill',
        source: 'phoenix-council-districts-heatillness',
        paint: {
          'fill-color': [
            'case',
            ['==', ['coalesce', ['get', 'heatIllnessNoData'], false], true],
            'rgba(82,82,91,0.80)', // neutral gray for "no data"
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'heatIllnessCount'], 0],
              // Tuned for current synthetic totals so we get a real distribution:
              // <50: yellowish, 50–250: amber, >250: red (smooth gradient across stops).
              0, 'rgba(34,197,94,0.80)',     // green
              50, 'rgba(234,179,8,0.80)',    // yellow
              150, 'rgba(245,158,11,0.80)',  // amber
              250, 'rgba(245,158,11,0.80)',  // deep amber
              400, 'rgba(249,115,22,0.80)',  // orange-red
              700, 'rgba(239,68,68,0.80)',   // red
            ],
          ],
          'fill-outline-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.75)',
            'rgba(255,255,255,0.25)',
          ],
        },
        layout: { visibility: 'none' },
      })

      map.current.addLayer({
        id: 'phoenix-council-districts-heatillness-border',
        type: 'line',
        source: 'phoenix-council-districts-heatillness',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.85)',
            'rgba(255,255,255,0.30)',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2.75,
            1.5,
          ],
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' },
      })

      map.current.addLayer({
        id: 'phoenix-council-districts-heatillness-labels',
        type: 'symbol',
        source: 'phoenix-council-districts-heatillness',
        layout: {
          visibility: 'none',
          'text-field': ['concat', 'District ', ['to-string', ['get', 'DISTRICT']]],
          'text-size': 15,
          'text-font': ['Open Sans Bold'],
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
          'text-radial-offset': 0.6,
          'text-padding': 1,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': 'rgba(255,255,255,0.88)',
          'text-halo-color': 'rgba(0,0,0,0.55)',
          'text-halo-width': 1.2,
        },
      })

      map.current.addLayer({
        id: 'phoenix-villages-heatillness-fill',
        type: 'fill',
        source: 'phoenix-villages-heatillness',
        paint: {
          'fill-color': [
            'case',
            ['==', ['coalesce', ['get', 'heatIllnessNoData'], false], true],
            'rgba(82,82,91,0.80)',
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'heatIllnessCount'], 0],
              0, 'rgba(34,197,94,0.80)',
              50, 'rgba(234,179,8,0.80)',
              150, 'rgba(245,158,11,0.80)',
              250, 'rgba(245,158,11,0.80)',
              400, 'rgba(249,115,22,0.80)',
              700, 'rgba(239,68,68,0.80)',
            ],
          ],
          'fill-outline-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.75)',
            'rgba(255,255,255,0.25)',
          ],
        },
        layout: { visibility: 'none' },
      })

      map.current.addLayer({
        id: 'phoenix-villages-heatillness-border',
        type: 'line',
        source: 'phoenix-villages-heatillness',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255,255,255,0.85)',
            'rgba(255,255,255,0.30)',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2.75,
            1.5,
          ],
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' },
      })

      map.current.addLayer({
        id: 'phoenix-villages-heatillness-labels',
        type: 'symbol',
        source: 'phoenix-villages-heatillness',
        layout: {
          visibility: 'none',
          'text-field': ['coalesce', ['get', 'NAME'], ''],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 15,
          'text-max-width': 10,
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
          'text-radial-offset': 0.6,
          'text-padding': 1,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.85)',
          'text-halo-width': 2.5,
          'text-opacity': 0.95,
        },
      })

      map.current.addSource('phoenix-cfs-flat', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.current.addLayer({
        id: 'phoenix-cfs-clusters',
        type: 'circle',
        source: 'phoenix-cfs-clustered',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            '#3b82f6', 50, '#2563eb', 200, '#1d4ed8',
          ],
          'circle-radius': [
            'step', ['get', 'point_count'],
            18, 50, 26, 200, 34,
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-cfs-cluster-count',
        type: 'symbol',
        source: 'phoenix-cfs-clustered',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'visibility': 'none',
        },
        paint: { 'text-color': '#ffffff' },
      }, firstSymbolId)

      // Unclustered points (from clustered source — points outside any cluster)
      map.current.addLayer({
        id: 'phoenix-cfs-unclustered',
        type: 'circle',
        source: 'phoenix-cfs-clustered',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 5,
          'circle-color': '#60a5fa',
          'circle-opacity': 0.9,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.4)',
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-cfs-points',
        type: 'circle',
        source: 'phoenix-cfs-flat',
        paint: {
          'circle-color': '#60a5fa',
          'circle-radius': 4,
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.35)',
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-cfs-heatmap',
        type: 'heatmap',
        source: 'phoenix-cfs-flat',
        maxzoom: 15,
        paint: {
          'heatmap-weight': heatmapConfig.weight,
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            0, heatmapConfig.intensityMin,
            15, heatmapConfig.intensityMax,
          ],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(255,255,255,0)',
            0.2, 'rgba(150,100,180,0.6)',
            0.4, 'rgba(180,80,140,0.7)',
            0.6, 'rgba(220,50,80,0.8)',
            0.8, 'rgba(240,100,50,0.9)',
            1, 'rgba(255,220,50,1)',
          ],
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            0, heatmapConfig.radiusMin,
            15, heatmapConfig.radiusMax,
          ],
          'heatmap-opacity': [
            'interpolate', ['linear'], ['zoom'],
            14, heatmapConfig.opacity,
            15, 0,
          ],
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-cfs-heatmap-points',
        type: 'circle',
        source: 'phoenix-cfs-flat',
        minzoom: 14,
        paint: {
          'circle-color': '#f97316',
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            14, 2,
            16, 4,
          ],
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            14, 0,
            15, 0.8,
          ],
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
          'circle-stroke-opacity': 1,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Phoenix: Homelessness services (synthetic scattered points only)

      // Phoenix: synthetic scattered points (no real provider geocodes)
      map.current.addSource('phoenix-homelessness-synthetic', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.current.addSource('phoenix-homelessness-clustered', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      })

      map.current.addLayer({
        id: 'phoenix-homelessness-synthetic-points',
        type: 'circle',
        source: 'phoenix-homelessness-synthetic',
        paint: {
          'circle-color': [
            'match', ['get', 'category'],
            'Emergency Shelter', '#f59e0b',
            'Street Outreach', '#22c55e',
            'Rapid Rehousing', '#3b82f6',
            '#eab308',
          ],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            9, 4,
            12, 8,
            15, 11,
          ],
          'circle-opacity': 1,
          'circle-stroke-width': 1.25,
          'circle-stroke-color': 'rgba(255,255,255,0.22)',
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Homelessness cluster layers
      map.current.addLayer({
        id: 'phoenix-homelessness-clusters',
        type: 'circle',
        source: 'phoenix-homelessness-clustered',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            '#eab308', 50, '#f59e0b', 200, '#f97316',
          ],
          'circle-radius': [
            'step', ['get', 'point_count'],
            18, 50, 26, 200, 34,
          ],
          'circle-opacity': 1,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-homelessness-cluster-count',
        type: 'symbol',
        source: 'phoenix-homelessness-clustered',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'visibility': 'none',
        },
        paint: { 'text-color': '#ffffff' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-homelessness-unclustered',
        type: 'circle',
        source: 'phoenix-homelessness-clustered',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match', ['get', 'category'],
            'Emergency Shelter', '#f59e0b',
            'Street Outreach', '#22c55e',
            'Rapid Rehousing', '#3b82f6',
            '#eab308',
          ],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            9, 4,
            12, 8,
            15, 11,
          ],
          'circle-opacity': 1,
          'circle-stroke-width': 1.25,
          'circle-stroke-color': 'rgba(255,255,255,0.22)',
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Homelessness heatmap layers
      map.current.addLayer({
        id: 'phoenix-homelessness-heatmap',
        type: 'heatmap',
        source: 'phoenix-homelessness-synthetic',
        maxzoom: 15,
        paint: {
          'heatmap-weight': heatmapConfig.weight,
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            0, heatmapConfig.intensityMin,
            15, heatmapConfig.intensityMax,
          ],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(255,255,255,0)',
            0.2, 'rgba(150,100,180,0.6)',
            0.4, 'rgba(180,80,140,0.7)',
            0.6, 'rgba(220,50,80,0.8)',
            0.8, 'rgba(240,100,50,0.9)',
            1, 'rgba(255,220,50,1)',
          ],
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            0, heatmapConfig.radiusMin,
            15, heatmapConfig.radiusMax,
          ],
          'heatmap-opacity': [
            'interpolate', ['linear'], ['zoom'],
            14, heatmapConfig.opacity,
            15, 0,
          ],
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      map.current.addLayer({
        id: 'phoenix-homelessness-heatmap-points',
        type: 'circle',
        source: 'phoenix-homelessness-synthetic',
        minzoom: 14,
        paint: {
          'circle-color': [
            'match', ['get', 'category'],
            'Emergency Shelter', '#f59e0b',
            'Street Outreach', '#22c55e',
            'Rapid Rehousing', '#3b82f6',
            '#eab308',
          ],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            14, 8,
            16, 11,
          ],
          'circle-opacity': 1,
          'circle-stroke-width': 1.25,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Baltimore 311 — source A: clustered
      map.current.addSource('baltimore-311-clustered', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      })

      // Baltimore 311 — source B: flat (all individual points)
      map.current.addSource('baltimore-311-flat', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Cluster circles
      const colors = getActiveColors()
      map.current.addLayer({
        id: 'baltimore-311-clusters',
        type: 'circle',
        source: 'baltimore-311-clustered',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            colors.clusterSmall, 50, colors.clusterMedium, 200, colors.clusterLarge,
          ],
          'circle-radius': [
            'step', ['get', 'point_count'],
            18, 50, 26, 200, 34,
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
          'circle-stroke-opacity': 1,
          'circle-pitch-alignment': 'viewport',
          'circle-pitch-scale': 'viewport',
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Cluster count labels
      map.current.addLayer({
        id: 'baltimore-311-cluster-count',
        type: 'symbol',
        source: 'baltimore-311-clustered',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'visibility': 'none',
        },
        paint: { 
          'text-color': '#ffffff',
          'text-opacity': 1,
        },
      }, firstSymbolId)

      // Unclustered points (from clustered source — points outside any cluster)
      map.current.addLayer({
        id: 'baltimore-311-unclustered',
        type: 'circle',
        source: 'baltimore-311-clustered',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 5,
          'circle-color': colors.pointColor,
          'circle-opacity': 0.9,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.4)',
          'circle-stroke-opacity': 1,
          'circle-pitch-alignment': 'viewport',
          'circle-pitch-scale': 'viewport',
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Flat points (from non-clustered source — all points individually)
      map.current.addLayer({
        id: 'baltimore-311-points',
        type: 'circle',
        source: 'baltimore-311-flat',
        paint: {
          'circle-radius': 4,
          'circle-color': colors.pointColor,
          'circle-opacity': 0.8,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
          'circle-stroke-opacity': 1,
          'circle-pitch-alignment': 'viewport',
          'circle-pitch-scale': 'viewport',
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Heatmap layer (density visualization)
      map.current.addLayer({
        id: 'baltimore-311-heatmap',
        type: 'heatmap',
        source: 'baltimore-311-flat',
        maxzoom: 15,
        paint: {
          'heatmap-weight': heatmapConfig.weight,
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            0, heatmapConfig.intensityMin,
            15, heatmapConfig.intensityMax,
          ],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(255,255,255,0)',
            0.2, 'rgba(150,100,180,0.6)',
            0.4, 'rgba(180,80,140,0.7)',
            0.6, 'rgba(220,50,80,0.8)',
            0.8, 'rgba(240,100,50,0.9)',
            1, 'rgba(255,220,50,1)',
          ],
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            0, heatmapConfig.radiusMin,
            15, heatmapConfig.radiusMax,
          ],
          'heatmap-opacity': [
            'interpolate', ['linear'], ['zoom'],
            14, heatmapConfig.opacity,
            15, 0,
          ],
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Heatmap circle layer (shows individual points at high zoom)
      map.current.addLayer({
        id: 'baltimore-311-heatmap-points',
        type: 'circle',
        source: 'baltimore-311-flat',
        minzoom: 14,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            14, 2,
            16, 4,
          ],
          'circle-color': colors.pointColor,
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            14, 0,
            15, 0.8,
          ],
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
          'circle-stroke-opacity': 1,
          'circle-pitch-alignment': 'viewport',
          'circle-pitch-scale': 'viewport',
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Click cluster → zoom to expand
      map.current.on('click', 'baltimore-311-clusters', async (e) => {
        const features = map.current.queryRenderedFeatures(e.point, { layers: ['baltimore-311-clusters'] })
        if (!features.length) return
        const clusterId = features[0].properties.cluster_id
        const zoom = await map.current.getSource('baltimore-311-clustered').getClusterExpansionZoom(clusterId)
        map.current.easeTo({ center: features[0].geometry.coordinates, zoom })
      })

      // Shared popup for unclustered + flat point clicks
      const showPointPopup = (e) => {
        const feature = e.features[0]
        const coords = feature.geometry.coordinates.slice()
        const properties = feature.properties || {}
        
        while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
          coords[0] += e.lngLat.lng > coords[0] ? 360 : -360
        }
        new mapLib.current.Popup({ closeButton: true, maxWidth: '280px', className: 'popup-311' })
          .setLngLat(coords)
          .setHTML(create311PopupHtml(properties))
          .addTo(map.current)
      }
      map.current.on('click', 'baltimore-311-unclustered', showPointPopup)
      map.current.on('click', 'baltimore-311-points', showPointPopup)
      map.current.on('click', 'baltimore-311-heatmap-points', showPointPopup)

      // Phoenix homelessness synthetic point popup
      const showPhoenixHomelessnessSyntheticPopup = (e) => {
        const feature = e.features[0]
        const coords = feature.geometry.coordinates.slice()
        const p = feature.properties || {}
        const currentSnap = phoenixHomelessnessSnapshotRef.current
        const snapLabel = currentSnap?.periodLabel || null
        const served = (currentSnap?.categories || []).find((c) => c?.category && c.category === p.category)?.value
        const servedLabel = Number.isFinite(served) ? Number(served).toLocaleString() : '—'

        while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
          coords[0] += e.lngLat.lng > coords[0] ? 360 : -360
        }

        new mapLib.current.Popup({ closeButton: true, maxWidth: '300px', className: 'popup-health' })
          .setLngLat(coords)
          .setHTML(`
            <div style="font-size:12px;line-height:1.4;color:rgba(255,255,255,0.9);min-width:220px">
              <div style="font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:rgba(255,255,255,0.42);margin-bottom:6px">
                Homelessness services
              </div>
              <div style="font-weight:600;font-size:13px;color:#fff;margin-bottom:10px;line-height:1.3">
                ${p.category || 'Service category'}
              </div>
              <div style="padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.25);color:rgba(255,255,255,0.8);font-size:12px">
                People served <strong style="color:#fff">${servedLabel}</strong>
              </div>
            </div>
          `)
          .addTo(map.current)
      }
      map.current.on('click', 'phoenix-homelessness-synthetic-points', showPhoenixHomelessnessSyntheticPopup)
      map.current.on('click', 'phoenix-homelessness-unclustered', showPhoenixHomelessnessSyntheticPopup)
      map.current.on('click', 'phoenix-homelessness-heatmap-points', showPhoenixHomelessnessSyntheticPopup)

      // Click homelessness cluster -> zoom
      map.current.on('click', 'phoenix-homelessness-clusters', async (e) => {
        const features = map.current.queryRenderedFeatures(e.point, { layers: ['phoenix-homelessness-clusters'] })
        if (!features.length) return
        const clusterId = features[0].properties.cluster_id
        const zoom = await map.current.getSource('phoenix-homelessness-clustered').getClusterExpansionZoom(clusterId)
        map.current.easeTo({ center: features[0].geometry.coordinates, zoom })
      })

      // Pointer cursor on hover
      ;[
        'baltimore-311-clusters',
        'baltimore-311-unclustered',
        'baltimore-311-points',
        'baltimore-311-heatmap-points',
        'phoenix-homelessness-synthetic-points',
        'phoenix-homelessness-clusters',
        'phoenix-homelessness-unclustered',
        'phoenix-homelessness-heatmap-points',
        'phoenix-villages-homelessness-fill',
        'phoenix-council-districts-temperature-fill',
        'phoenix-villages-heatdeaths-fill',
        'phoenix-villages-cfs-rag-fill',
      ].forEach((id) => {
        map.current.on('mouseenter', id, () => { map.current.getCanvas().style.cursor = 'pointer' })
        map.current.on('mouseleave', id, () => { map.current.getCanvas().style.cursor = '' })
      })

      // Phoenix temperature districts: hover tooltip (when labels are off)
      let hoveredTempDistrictId = null
      let temperatureDistrictPopup = null

      const clearTempPopup = () => {
        try { temperatureDistrictPopup?.remove?.() } catch {}
        temperatureDistrictPopup = null
      }

      map.current.on('mousemove', 'phoenix-council-districts-temperature-fill', (e) => {
        if (phoenixTemperatureNeighborhoodsLabelsVisibleRef.current) return
        const f = e.features?.[0]
        const id = f?.properties?.DISTRICT
        if (!id) return

        // Keep a lightweight hovered id (no feature-state styling needed)
        hoveredTempDistrictId = id

        clearTempPopup()
        const tempC = Number(f?.properties?.tempAvgC)
        const tempF = Number.isFinite(tempC) ? (tempC * 9) / 5 + 32 : null
        const tempLabel = Number.isFinite(tempF) ? `${Math.round(tempF)}°F` : '—'
        const center = [e.lngLat.lng, e.lngLat.lat]

        temperatureDistrictPopup = new mapLib.current.Popup({
          closeButton: false,
          closeOnClick: false,
          maxWidth: '140px',
          className: 'popup-311',
          offset: 10,
        })
          .setLngLat(center)
          .setHTML(`
            <div style="font-size:12px;font-weight:600;line-height:1.1;color:rgba(255,255,255,0.92)">
              District ${String(id)} · Temp ${tempLabel}
            </div>
          `)
          .addTo(map.current)
      })

      map.current.on('mouseleave', 'phoenix-council-districts-temperature-fill', () => {
        hoveredTempDistrictId = null
        clearTempPopup()
      })

      // Phoenix heat deaths: hover tooltip (when labels are off)
      let heatDeathsVillagePopup = null
      const clearHeatDeathsPopup = () => {
        try { heatDeathsVillagePopup?.remove?.() } catch {}
        heatDeathsVillagePopup = null
      }

      map.current.on('mousemove', 'phoenix-villages-heatdeaths-fill', (e) => {
        if (phoenixHeatDeathsLabelsVisibleRef.current) return
        const f = e.features?.[0]
        const id = f?.properties?.NAME
        if (!id) return
        clearHeatDeathsPopup()
        const deaths = Number(f?.properties?.heatDeaths)
        const label = Number.isFinite(deaths) ? String(Math.round(deaths)) : '—'
        heatDeathsVillagePopup = new mapLib.current.Popup({
          closeButton: false,
          closeOnClick: false,
          maxWidth: '160px',
          className: 'popup-311',
          offset: 10,
        })
          .setLngLat([e.lngLat.lng, e.lngLat.lat])
          .setHTML(`<div style="font-size:12px;font-weight:600;line-height:1.1;color:rgba(255,255,255,0.92)">Heat Deaths ${label}</div>`)
          .addTo(map.current)
      })

      map.current.on('mouseleave', 'phoenix-villages-heatdeaths-fill', () => {
        clearHeatDeathsPopup()
      })

      // Phoenix affected districts (homelessness): hover, select, tooltip
      let hoveredVillageId = null
      let selectedVillageId = null
      let homelessnessVillagePopup = null

      const clearPopup = () => {
        try { homelessnessVillagePopup?.remove?.() } catch {}
        homelessnessVillagePopup = null
      }

      map.current.on('mousemove', 'phoenix-council-districts-homelessness-fill', (e) => {
        const f = e.features?.[0]
        const id = String(f?.properties?.OBJECTID ?? f?.id ?? '')
        if (!id) return
        if (hoveredVillageId && hoveredVillageId !== id) {
          map.current.setFeatureState({ source: 'phoenix-council-districts-homelessness', id: hoveredVillageId }, { hover: false })
        }
        hoveredVillageId = id
        map.current.setFeatureState({ source: 'phoenix-council-districts-homelessness', id }, { hover: true })
      })

      map.current.on('mouseleave', 'phoenix-council-districts-homelessness-fill', () => {
        if (hoveredVillageId) {
          map.current.setFeatureState({ source: 'phoenix-council-districts-homelessness', id: hoveredVillageId }, { hover: false })
          hoveredVillageId = null
        }
      })

      map.current.on('click', 'phoenix-council-districts-homelessness-fill', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const id = String(f?.properties?.OBJECTID ?? f?.id ?? '')
        if (!id) return
        const districtLabel = String(f?.properties?.DISTRICT ?? f?.properties?.District ?? id)

        // Single select toggle
        if (selectedVillageId && selectedVillageId !== id) {
          map.current.setFeatureState({ source: 'phoenix-council-districts-homelessness', id: selectedVillageId }, { selected: false })
        }
        const nextSelected = selectedVillageId !== id
        selectedVillageId = nextSelected ? id : null
        map.current.setFeatureState({ source: 'phoenix-council-districts-homelessness', id }, { selected: nextSelected })

        clearPopup()
        if (!nextSelected) return

        const center = getGeojsonFeatureCenter(f) || [e.lngLat.lng, e.lngLat.lat]
        const total = Number(f?.properties?.homelessCount || 0)
        let byCat = []
        try { byCat = JSON.parse(f?.properties?.homelessByCategoryJson || '[]') } catch { byCat = [] }

        // Tooltip styling inspired by IC Prototype NeighborhoodStatsCard (full variant)
        const tierKey =
          total >= 50 ? 'critical'
          : total >= 25 ? 'high'
          : total >= 10 ? 'moderate'
          : 'watch'

        const SPEC_TIERS = {
          critical: {
            headerBg: '#7A2020',
            border: '#7A2020',
            labelColor: '#FCA5A5',
            dot: '#F87171',
            bg: '#1C0F0F',
            nameColor: '#FEE2E2',
            bodySubtext: '#F87171',
            bodyStat: '#FCA5A5',
            severityLabel: 'Critical',
          },
          high: {
            headerBg: '#92400E',
            border: '#92400E',
            labelColor: '#FBBF24',
            dot: '#F59E0B',
            bg: '#1A1308',
            nameColor: '#FFFBEB',
            bodySubtext: '#FBBF24',
            bodyStat: '#FDE68A',
            severityLabel: 'High priority',
          },
          moderate: {
            headerBg: '#713F12',
            border: '#713F12',
            labelColor: '#FDE047',
            dot: '#EAB308',
            bg: '#1A1709',
            nameColor: '#FEFCE8',
            bodySubtext: '#FACC15',
            bodyStat: '#FEF08A',
            severityLabel: 'Moderate',
          },
          watch: {
            headerBg: '#374151',
            border: '#4B5563',
            labelColor: '#D1D5DB',
            dot: '#9CA3AF',
            bg: '#141618',
            nameColor: '#F3F4F6',
            bodySubtext: '#9CA3AF',
            bodyStat: '#E5E7EB',
            severityLabel: 'Watch',
          },
        }
        const spec = SPEC_TIERS[tierKey] || SPEC_TIERS.watch

        // People served (from PhoenixHomelesness.csv snapshot) for the selected month
        const servedByCat = new Map(
          (phoenixHomelessnessSnapshotRef.current?.categories || [])
            .filter((c) => c?.category && Number.isFinite(c?.value))
            .map((c) => [c.category, c.value])
        )

        const enabledCats = phoenixHomelessnessCategoryEnabledRef.current || {}
        const servedRows = Array.from(servedByCat.entries())
          .filter(([cat]) => enabledCats?.[cat] !== false)
          .map(([category, value]) => ({ category, value }))
          .sort((a, b) => (b.value || 0) - (a.value || 0))

        const servedTotal = servedRows.length
          ? servedRows.reduce((acc, r) => acc + (Number.isFinite(r.value) ? r.value : 0), 0)
          : null
        const topServedCat = servedRows?.[0]?.category ? String(servedRows[0].category).toLowerCase() : null
        const topSummary = topServedCat ? `· mostly ${topServedCat}` : ''

        const rows = servedRows.length
          ? servedRows
              .map((r) => `
                <div style="display:flex;justify-content:space-between;gap:8px;margin-top:3px">
                  <span style="color:rgba(255,255,255,0.75);font-size:11px">${r.category}</span>
                  <span style="font-weight:700;color:${spec.nameColor};font-size:11px">${Number(r.value || 0).toLocaleString()}</span>
                </div>
              `)
              .join('')
          : ''

        homelessnessVillagePopup = new mapLib.current.Popup({ closeButton: false, closeOnClick: false, maxWidth: '220px', className: 'popup-homelessness-card' })
          .setLngLat(center)
          .setHTML(`
              <div style="
                min-width:160px;
              background-color:${spec.bg};
              border:1px solid ${spec.border};
              border-radius:8px;
                padding:8px 10px;
              color:rgba(255,255,255,0.92);
              box-shadow:0 8px 24px rgba(0, 0, 0, 0.40);
              font-size:12px;
              line-height:1.35;
            ">
              <div style="
                display:flex;
                align-items:flex-start;
                gap:6px;
                background:${spec.headerBg};
                margin:-8px -10px 8px -10px;
                padding:5px 10px;
                border-top-left-radius:8px;
                border-top-right-radius:8px;
              ">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;row-gap:4px;flex:1 1 auto;min-width:0">
                  <span style="font-size:8px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${spec.labelColor}">Homelessness services</span>
                </div>
              </div>

              <div style="font-weight:650;font-size:14px;color:${spec.nameColor};margin-bottom:4px;line-height:1.2">District ${districtLabel}</div>

              <div style="color:${spec.bodySubtext};font-size:11px;margin-bottom:2px">
                ${Number.isFinite(servedTotal) ? servedTotal.toLocaleString() : '—'} people served <span style="opacity:0.9">${topSummary}</span>
              </div>

              ${rows ? `<div style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px">${rows}</div>` : ''}
            </div>
          `)
          .addTo(map.current)
      })

      // ========== HEALTH DATA LAYERS ==========
      
      // Overdose incidents source
      map.current.addSource('health-overdose', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Overdose incidents layer (color-coded by outcome)
      map.current.addLayer({
        id: 'health-overdose-points',
        type: 'circle',
        source: 'health-overdose',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 3,
            14, 6,
            16, 9,
          ],
          'circle-color': [
            'match', ['get', 'outcome'],
            'Fatal', '#dc2626',
            'Hospitalized', '#f97316',
            'Survived', '#fbbf24',
            '#9ca3af',
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': 'rgba(255,255,255,0.4)',
          'circle-stroke-opacity': 1,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Naloxone distribution source
      map.current.addSource('health-naloxone', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Naloxone distribution layer (sized by kits distributed)
      map.current.addLayer({
        id: 'health-naloxone-points',
        type: 'circle',
        source: 'health-naloxone',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'kitsDistributed'],
            0, 5,
            100, 8,
            300, 12,
            500, 16,
          ],
          'circle-color': '#10b981',
          'circle-opacity': 0.75,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.5)',
          'circle-stroke-opacity': 1,
        },
        layout: { visibility: 'none' },
      }, firstSymbolId)

      // Overdose popup
      const showOverdosePopup = (e) => {
        const feature = e.features[0]
        const coords = feature.geometry.coordinates.slice()
        const { incidentDate, substance, outcome, ageGroup, race, sex, naloxoneAdministered, responseTime, neighborhood } = feature.properties
        
        const date = new Date(incidentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        
        while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
          coords[0] += e.lngLat.lng > coords[0] ? 360 : -360
        }
        
        new mapLib.current.Popup({ closeButton: true, maxWidth: '280px', className: 'popup-health' })
          .setLngLat(coords)
          .setHTML(`
            <div style="font-size:13px;line-height:1.5;color:rgba(255,255,255,0.9);min-width:220px">
              <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px">Overdose Incident</div>
              <div style="font-weight:600;font-size:14px;color:#fff;margin-bottom:6px;line-height:1.3">${substance}</div>
              <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-bottom:4px">${date}${neighborhood ? ` · ${neighborhood}` : ''}</div>
              
              <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px">
                <div>
                  <div style="color:rgba(255,255,255,0.4);margin-bottom:2px">Demographics</div>
                  <div style="color:rgba(255,255,255,0.8)">${sex}, ${ageGroup}</div>
                  <div style="color:rgba(255,255,255,0.6);font-size:10px">${race}</div>
                </div>
                <div>
                  <div style="color:rgba(255,255,255,0.4);margin-bottom:2px">Response</div>
                  <div style="color:rgba(255,255,255,0.8)">${responseTime}</div>
                  <div style="color:rgba(255,255,255,0.6);font-size:10px">${naloxoneAdministered ? 'Naloxone given' : 'No naloxone'}</div>
                </div>
              </div>
              
              <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08)">
                <span style="
                  display:inline-flex;align-items:center;gap:4px;
                  padding:2px 8px;border-radius:5px;font-size:11px;font-weight:500;
                  background:${outcome === 'Fatal' ? 'rgba(220,38,38,0.15)' : outcome === 'Hospitalized' ? 'rgba(249,115,22,0.15)' : 'rgba(251,191,36,0.15)'};
                  color:${outcome === 'Fatal' ? '#fca5a5' : outcome === 'Hospitalized' ? '#fb923c' : '#fde047'};
                  border:1px solid ${outcome === 'Fatal' ? 'rgba(220,38,38,0.35)' : outcome === 'Hospitalized' ? 'rgba(249,115,22,0.35)' : 'rgba(251,191,36,0.35)'};
                ">
                  <span style="width:5px;height:5px;border-radius:50%;background:currentColor;display:inline-block"></span>
                  ${outcome}
                </span>
              </div>
            </div>
          `)
          .addTo(map.current)
      }
      map.current.on('click', 'health-overdose-points', showOverdosePopup)

      // Naloxone popup
      const showNaloxonePopup = (e) => {
        const feature = e.features[0]
        const coords = feature.geometry.coordinates.slice()
        const { distributionDate, locationType, locationName, kitsDistributed, organizationName, recurring, neighborhood } = feature.properties
        
        const date = new Date(distributionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        
        while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
          coords[0] += e.lngLat.lng > coords[0] ? 360 : -360
        }
        
        new mapLib.current.Popup({ closeButton: true, maxWidth: '280px', className: 'popup-health' })
          .setLngLat(coords)
          .setHTML(`
            <div style="font-size:13px;line-height:1.5;color:rgba(255,255,255,0.9);min-width:220px">
              <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px">Naloxone Distribution</div>
              <div style="font-weight:600;font-size:14px;color:#fff;margin-bottom:6px;line-height:1.3">${locationName}</div>
              <div style="color:rgba(255,255,255,0.6);font-size:12px;margin-bottom:4px">${date}${neighborhood ? ` · ${neighborhood}` : ''}</div>
              
              <div style="margin-top:8px;font-size:11px">
                <div style="margin-bottom:6px">
                  <span style="color:rgba(255,255,255,0.4)">Organization: </span>
                  <span style="color:rgba(255,255,255,0.8)">${organizationName}</span>
                </div>
                <div style="margin-bottom:6px">
                  <span style="color:rgba(255,255,255,0.4)">Location Type: </span>
                  <span style="color:rgba(255,255,255,0.8)">${locationType}</span>
                </div>
                <div>
                  <span style="color:rgba(255,255,255,0.4)">Kits Distributed: </span>
                  <span style="color:#10b981;font-weight:600">${kitsDistributed}</span>
                </div>
              </div>
              
              ${recurring ? `
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08)">
                  <span style="
                    display:inline-flex;align-items:center;gap:4px;
                    padding:2px 8px;border-radius:5px;font-size:11px;font-weight:500;
                    background:rgba(16,185,129,0.15);
                    color:#34d399;
                    border:1px solid rgba(16,185,129,0.35);
                  ">
                    <span style="width:5px;height:5px;border-radius:50%;background:currentColor;display:inline-block"></span>
                    Recurring Site
                  </span>
                </div>
              ` : ''}
            </div>
          `)
          .addTo(map.current)
      }
      map.current.on('click', 'health-naloxone-points', showNaloxonePopup)

      // Pointer cursor for health layers
      ;['health-overdose-points', 'health-naloxone-points'].forEach((id) => {
        map.current.on('mouseenter', id, () => { map.current.getCanvas().style.cursor = 'pointer' })
        map.current.on('mouseleave', id, () => { map.current.getCanvas().style.cursor = '' })
      })

      // FORCE PAINT PROPERTIES (override any Mapbox style defaults)
      // This ensures our custom colors are preserved regardless of the basemap style
      setTimeout(() => {
        const colors = getActiveColors()
        
        // 311 Clusters
        forcePaintProperty('baltimore-311-clusters', 'circle-color', [
          'step', ['get', 'point_count'],
          colors.clusterSmall, 50, colors.clusterMedium, 200, colors.clusterLarge,
        ])
        forcePaintProperty('baltimore-311-clusters', 'circle-stroke-color', 'rgba(255,255,255,0.25)')
        forcePaintProperty('baltimore-311-clusters', 'circle-opacity', 0.85)
        
        // 311 Unclustered points
        forcePaintProperty('baltimore-311-unclustered', 'circle-color', colors.pointColor)
        forcePaintProperty('baltimore-311-unclustered', 'circle-stroke-color', 'rgba(255,255,255,0.4)')
        forcePaintProperty('baltimore-311-unclustered', 'circle-opacity', 0.9)
        
        // 311 Flat points
        forcePaintProperty('baltimore-311-points', 'circle-color', colors.pointColor)
        forcePaintProperty('baltimore-311-points', 'circle-stroke-color', 'rgba(255,255,255,0.25)')
        forcePaintProperty('baltimore-311-points', 'circle-opacity', 0.8)
        
        // 311 Heatmap points
        forcePaintProperty('baltimore-311-heatmap-points', 'circle-color', colors.pointColor)
        forcePaintProperty('baltimore-311-heatmap-points', 'circle-stroke-color', 'rgba(255,255,255,0.25)')
        
        // Cluster labels
        forcePaintProperty('baltimore-311-cluster-count', 'text-color', '#ffffff')
        
        // Health - Overdose (preserve outcome-based colors)
        forcePaintProperty('health-overdose-points', 'circle-color', [
          'match', ['get', 'outcome'],
          'Fatal', '#dc2626',
          'Hospitalized', '#f97316',
          'Survived', '#fbbf24',
          '#9ca3af',
        ])
        forcePaintProperty('health-overdose-points', 'circle-stroke-color', 'rgba(255,255,255,0.4)')
        forcePaintProperty('health-overdose-points', 'circle-opacity', 0.85)
        
        // Health - Naloxone
        forcePaintProperty('health-naloxone-points', 'circle-color', '#10b981')
        forcePaintProperty('health-naloxone-points', 'circle-stroke-color', 'rgba(255,255,255,0.5)')
        forcePaintProperty('health-naloxone-points', 'circle-opacity', 0.75)
      }, 100)

      setMapLoaded(true)
      setCurrentEngine('maplibre') // Track current engine
    })
  }

  initMap()

  return () => {
    if (map.current) {
      map.current.remove()
      map.current = null
    }
  }
}, [selectedCity]) // Re-run when city changes

  // Apply view preset when city changes (after map is loaded)
  useEffect(() => {
    console.log('📸 Camera preset effect triggered:', { selectedCity, mapLoaded })
    
    if (!map.current || !mapLoaded) return
    
    const preset = getViewPreset(selectedCity, 'maplibre')
    console.log('🎬 Applying camera preset:', preset)
    if (!preset) return

    // Smoothly fly to the preset view
    map.current.flyTo({
      center: preset.center,
      zoom: preset.zoom,
      pitch: preset.pitch,
      bearing: preset.bearing,
      duration: 1500, // 1.5 second animation
      essential: true
    })
  }, [selectedCity, mapLoaded])

  // Future-date emphasis: dim/desaturate *basemap only* for any future selected date.
  // We avoid CSS filters (which affect overlays) and instead lower opacity on
  // basemap style layers, leaving our overlay layers untouched.
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const today = new Date()
    const isFuture = (() => {
      if (!(selectedDate instanceof Date) || Number.isNaN(selectedDate.getTime())) return false
      // Compare by calendar day, not timestamp (avoid treating "later today" as future).
      if (selectedDate.getFullYear() !== today.getFullYear()) return selectedDate.getFullYear() > today.getFullYear()
      if (selectedDate.getMonth() !== today.getMonth()) return selectedDate.getMonth() > today.getMonth()
      return selectedDate.getDate() > today.getDate()
    })()

    const style = map.current.getStyle?.()
    const layers = style?.layers || []
    if (!layers.length) return

    if (basemapPaintOriginalRef.current == null) basemapPaintOriginalRef.current = new Map()

    const overlaySourceIds = new Set([
      'neighborhood-risk',
      'baltimore-neighborhoods',
      'baltimore-311',
      'health-overdose',
      'health-naloxone',
      'phoenix-villages',
      'phoenix-council-districts',
      'phoenix-council-districts-heatillness',
      'phoenix-villages-heatillness',
      'phoenix-villages-homelessness',
      'phoenix-council-districts-homelessness',
      'phoenix-council-districts-temperature',
      'phoenix-villages-heatdeaths',
      'phoenix-villages-cfs-rag',
      'phoenix-council-districts-cfs-rag',
      'phoenix-cfs-flat',
      'phoenix-homelessness-synthetic',
      'phoenix-homelessness-clustered',
    ])

    const overlayIdPrefixes = [
      'phoenix-',
      'baltimore-311',
      'health-',
      'neighborhood-risk',
    ]

    const isOverlayLayer = (layer) => {
      const id = String(layer?.id || '')
      const src = layer?.source ? String(layer.source) : ''
      if (src && overlaySourceIds.has(src)) return true
      if (overlayIdPrefixes.some((p) => id.startsWith(p))) return true
      return false
    }

    const propsForType = (type) => {
      if (type === 'fill') return ['fill-opacity']
      if (type === 'line') return ['line-opacity']
      if (type === 'symbol') return ['text-opacity', 'icon-opacity']
      if (type === 'background') return ['background-opacity']
      if (type === 'raster') return ['raster-opacity']
      if (type === 'circle') return ['circle-opacity']
      if (type === 'heatmap') return ['heatmap-opacity']
      return []
    }

    // ~75% "desaturation" feel via basemap dimming.
    const DIM_FACTOR = 0.35
    const dimValueFor = (orig) => (typeof orig === 'number' ? Math.max(0, Math.min(1, orig * DIM_FACTOR)) : DIM_FACTOR)

    for (const layer of layers) {
      if (!layer?.id) continue
      if (isOverlayLayer(layer)) continue
      const layerId = layer.id
      const type = layer.type
      const props = propsForType(type)
      if (!props.length) continue

      let layerMap = basemapPaintOriginalRef.current.get(layerId)
      if (!layerMap) {
        layerMap = new Map()
        basemapPaintOriginalRef.current.set(layerId, layerMap)
      }

      for (const p of props) {
        if (!map.current.getLayer(layerId)) continue
        if (!layerMap.has(p)) {
          try {
            layerMap.set(p, map.current.getPaintProperty(layerId, p))
          } catch {}
        }
        const orig = layerMap.get(p)
        try {
          map.current.setPaintProperty(layerId, p, isFuture ? dimValueFor(orig) : orig)
        } catch {}
      }
    }
  }, [selectedDate, mapLoaded])

  // Focus requests from other views (e.g. Work Orders "Go To Map")
  useEffect(() => {
    if (!map.current || !mapLoaded || !mapFocusRequest) return
    const { lng, lat, zoom } = mapFocusRequest
    if (typeof lng !== 'number' || typeof lat !== 'number') return

    map.current.flyTo({
      center: [lng, lat],
      zoom: zoom || Math.max(map.current.getZoom(), 14),
      duration: 1200,
      essential: true,
    })
  }, [mapFocusRequest, mapLoaded])

  // Popup requests from other views (e.g. Work Orders "Go To Map")
  useEffect(() => {
    if (!map.current || !mapLoaded || !mapPopupRequest || !mapLib.current) return
    const { lng, lat, properties } = mapPopupRequest
    if (typeof lng !== 'number' || typeof lat !== 'number') return

    const openPopup = () => {
      new mapLib.current.Popup({ closeButton: true, maxWidth: '280px', className: 'popup-311' })
        .setLngLat([lng, lat])
        .setHTML(create311PopupHtml(properties || {}))
        .addTo(map.current)
    }

    // Small delay lets map transition start/complete for better UX
    const timer = setTimeout(openPopup, 350)
    return () => clearTimeout(timer)
  }, [mapPopupRequest, mapLoaded, selectedDate])

  // Update 311 layer colors in real-time when color settings change
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    
    const colors = getActiveColors()
    
    // Update cluster colors
    if (map.current.getLayer('baltimore-311-clusters')) {
      map.current.setPaintProperty('baltimore-311-clusters', 'circle-color', [
        'step', ['get', 'point_count'],
        colors.clusterSmall, 50, colors.clusterMedium, 200, colors.clusterLarge,
      ])
    }
    
    // Update unclustered point colors
    if (map.current.getLayer('baltimore-311-unclustered')) {
      map.current.setPaintProperty('baltimore-311-unclustered', 'circle-color', colors.pointColor)
    }
    
    // Update flat point colors
    if (map.current.getLayer('baltimore-311-points')) {
      map.current.setPaintProperty('baltimore-311-points', 'circle-color', colors.pointColor)
    }
    
    // Update heatmap point colors
    if (map.current.getLayer('baltimore-311-heatmap-points')) {
      map.current.setPaintProperty('baltimore-311-heatmap-points', 'circle-color', colors.pointColor)
    }
  }, [mapLibreColors, mapLoaded]) // Re-run when colors change

  // Neighborhood risk layer visibility (St. Louis only)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getLayer('neighborhood-risk-fill')) return
    const visibility = selectedCity === 'stl' && neighborhoodsRiskVisible ? 'visible' : 'none'
    map.current.setLayoutProperty('neighborhood-risk-fill', 'visibility', visibility)
    map.current.setLayoutProperty('neighborhood-risk-border', 'visibility', visibility)
  }, [neighborhoodsRiskVisible, selectedCity, mapLoaded])

  // Baltimore neighborhoods - fetch full data from ArcGIS server (no optimization)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('baltimore-neighborhoods')) return
    
    const isBaltimore = selectedCity === 'baltimore'
    
    if (!isBaltimore) {
      // Hide when not in Baltimore
      map.current.setLayoutProperty('baltimore-neighborhoods-fill', 'visibility', 'none')
      map.current.setLayoutProperty('baltimore-neighborhoods-border', 'visibility', 'none')
      map.current.setLayoutProperty('baltimore-neighborhoods-labels', 'visibility', 'none')
      setBaltimoreNeighborhoodsData(null)
      return
    }

    // Fetch full, unoptimized neighborhood data from ArcGIS
    const neighborhoodsUrl = 'https://services1.arcgis.com/mVFRs7NF4iFitgbY/arcgis/rest/services/GP_Boundaries/FeatureServer/1/query?where=1%3D1&outFields=Name&f=geojson'
    
    fetch(neighborhoodsUrl)
      .then(r => r.json())
      .then(geojson => {
        if (map.current && map.current.getSource('baltimore-neighborhoods')) {
          // Store in context for panel to build individual toggles
          setBaltimoreNeighborhoodsData(geojson)
          
          // Set the full data initially (filtering will happen in separate effect)
          map.current.getSource('baltimore-neighborhoods').setData(geojson)
        }
      })
      .catch(err => {
        console.warn('Baltimore neighborhoods fetch failed:', err)
      })
  }, [selectedCity, mapLoaded, setBaltimoreNeighborhoodsData])

  // Phoenix villages - load GeoJSON once and toggle visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('phoenix-villages')) return

    const shouldShow = selectedCity === 'phoenix' && phoenixNeighborhoodBoundariesVisible
    const visibility = shouldShow ? 'visible' : 'none'

    const applyVisibility = () => {
      if (!map.current) return
      if (map.current.getLayer('phoenix-villages-fill')) map.current.setLayoutProperty('phoenix-villages-fill', 'visibility', visibility)
      if (map.current.getLayer('phoenix-villages-border')) map.current.setLayoutProperty('phoenix-villages-border', 'visibility', visibility)
      if (map.current.getLayer('phoenix-villages-labels')) map.current.setLayoutProperty('phoenix-villages-labels', 'visibility', visibility)
    }

    if (!shouldShow) {
      applyVisibility()
      return
    }

    // Prefer boundary data already loaded in context
    const base = phoenixVillagesGeojson || phoenixVillagesCache.current

    const applyData = (geojson) => {
      const enabled = phoenixVillagesEnabled || {}
      const enabledNames = Object.keys(enabled).filter((k) => enabled[k] !== false)
      const filtered = enabledNames.length
        ? { type: 'FeatureCollection', features: (geojson?.features || []).filter((f) => enabled[f?.properties?.NAME] !== false) }
        : { type: 'FeatureCollection', features: [] }
      map.current.getSource('phoenix-villages').setData(filtered)
      applyVisibility()
    }

    if (base) {
      applyData(base)
      return
    }

    fetch(phoenixVillagesUrl)
      .then((r) => r.json())
      .then((geojson) => {
        phoenixVillagesCache.current = geojson
        if (!map.current || !map.current.getSource('phoenix-villages')) return
        applyData(geojson)
      })
      .catch((err) => {
        console.warn('Phoenix villages fetch failed:', err)
        applyVisibility()
      })
  }, [selectedCity, phoenixNeighborhoodBoundariesVisible, phoenixVillagesGeojson, phoenixVillagesEnabled, mapLoaded])

  // Phoenix council districts - load GeoJSON once and toggle visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('phoenix-council-districts')) return

    const showBoundaries = selectedCity === 'phoenix' && phoenixCouncilDistrictBoundariesVisible
    const showLabels = selectedCity === 'phoenix' && (
      phoenixCouncilDistrictBoundariesVisible ||
      phoenixCoolingCentersVisible ||
      phoenixHomelessnessAffectedNeighborhoodsVisible
    )
    const boundariesVis = showBoundaries ? 'visible' : 'none'
    const labelsVis = showLabels ? 'visible' : 'none'

    const applyVisibility = () => {
      if (!map.current) return
      if (map.current.getLayer('phoenix-council-districts-fill')) map.current.setLayoutProperty('phoenix-council-districts-fill', 'visibility', boundariesVis)
      if (map.current.getLayer('phoenix-council-districts-border')) map.current.setLayoutProperty('phoenix-council-districts-border', 'visibility', boundariesVis)
      if (map.current.getLayer('phoenix-council-districts-labels')) map.current.setLayoutProperty('phoenix-council-districts-labels', 'visibility', labelsVis)
    }

    if (!showLabels) {
      applyVisibility()
      return
    }

    const base = phoenixCouncilDistrictsGeojson || phoenixCouncilDistrictsCache.current

    const applyData = (geojson) => {
      const enabled = phoenixCouncilDistrictsEnabled || {}
      const enabledKeys = Object.keys(enabled).filter((k) => enabled[k] !== false)
      const filtered = enabledKeys.length
        ? {
          type: 'FeatureCollection',
          features: (geojson?.features || []).filter((f) => enabled[String(f?.properties?.DISTRICT ?? '').trim()] !== false),
        }
        : { type: 'FeatureCollection', features: [] }

      map.current.getSource('phoenix-council-districts').setData(filtered)
      applyVisibility()
    }

    if (base) {
      applyData(base)
      return
    }

    fetch(phoenixCouncilDistrictsUrl)
      .then((r) => r.json())
      .then((geojson) => {
        phoenixCouncilDistrictsCache.current = geojson
        if (!map.current || !map.current.getSource('phoenix-council-districts')) return
        applyData(geojson)
      })
      .catch((err) => {
        console.warn('Phoenix council districts fetch failed:', err)
        applyVisibility()
      })
  }, [
    selectedCity,
    phoenixCouncilDistrictBoundariesVisible,
    phoenixCoolingCentersVisible,
    phoenixHomelessnessAffectedNeighborhoodsVisible,
    phoenixCouncilDistrictsGeojson,
    phoenixCouncilDistrictsEnabled,
    mapLoaded,
  ])

  // Situational Awareness View — top-N district highlights (additive overlay).
  // Mirrors MapView so behavior stays in lock-step across the two map pages.
  const phoenixSituationalGeoTick = useRef(0)
  const [phoenixSituationalGeoReady, setPhoenixSituationalGeoReady] = useState(false)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (selectedCity !== 'phoenix') return
    let cancelled = false
    const run = (geojson) => {
      if (cancelled || !map.current) return
      applyPhoenixSituationalLayers(map.current, {
        geojson,
        selectedDate,
        flags: phoenixSituationalAwareness,
      })
    }
    const cached = phoenixCouncilDistrictsGeojson || phoenixCouncilDistrictsCache.current
    if (cached) {
      run(cached)
      return () => { cancelled = true }
    }
    const tick = ++phoenixSituationalGeoTick.current
    fetch(phoenixCouncilDistrictsUrl)
      .then((r) => r.json())
      .then((geojson) => {
        if (cancelled || tick !== phoenixSituationalGeoTick.current) return
        phoenixCouncilDistrictsCache.current = geojson
        setPhoenixSituationalGeoReady((v) => !v)
        run(geojson)
      })
      .catch((err) => {
        if (!cancelled) console.warn('Phoenix Situational Awareness geojson fetch failed:', err)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity, phoenixCouncilDistrictsGeojson, phoenixSituationalAwareness, selectedDate, mapLoaded, phoenixSituationalGeoReady])

  // Phoenix heat illnesses (synthetic demo) — council district choropleth
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('phoenix-council-districts-heatillness')) return

    const geoView = String(phoenixHeatIllnessesGeoView || 'districts')
    const shouldShow = selectedCity === 'phoenix' && phoenixHeatIllnessesVisible
    const vis = shouldShow ? 'visible' : 'none'

    const setVis = (id, v) => {
      if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', v)
    }

    setVis('phoenix-council-districts-heatillness-fill', shouldShow && geoView === 'districts' ? 'visible' : 'none')
    setVis('phoenix-council-districts-heatillness-border', shouldShow && geoView === 'districts' ? 'visible' : 'none')
    setVis('phoenix-villages-heatillness-fill', shouldShow && geoView === 'villages' ? 'visible' : 'none')
    setVis('phoenix-villages-heatillness-border', shouldShow && geoView === 'villages' ? 'visible' : 'none')
    const labelsWant = !!(shouldShow && phoenixHeatIllnessGeoLabelsVisible)
    setVis('phoenix-council-districts-heatillness-labels', labelsWant && geoView === 'districts' ? 'visible' : 'none')
    setVis('phoenix-villages-heatillness-labels', labelsWant && geoView === 'villages' ? 'visible' : 'none')

    if (!shouldShow) {
      map.current.getSource('phoenix-council-districts-heatillness').setData({ type: 'FeatureCollection', features: [] })
      if (map.current.getSource('phoenix-villages-heatillness')) {
        map.current.getSource('phoenix-villages-heatillness').setData({ type: 'FeatureCollection', features: [] })
      }
      if (phoenixHeatIllnessesPopup.current) {
        phoenixHeatIllnessesPopup.current.remove()
        phoenixHeatIllnessesPopup.current = null
      }
      return
    }

    const enabledIllnesses = phoenixHeatIllnessesEnabled || {}
    const enabledSet = new Set(Object.keys(enabledIllnesses).filter((k) => enabledIllnesses[k] !== false))

    const timeMode = String(phoenixHeatIllnessesTimeMode || 'current')
    const granularity = String(phoenixHeatIllnessesGranularity || 'week')

    const rows = (phoenixHeatIllnessesSyntheticDemo?.rows || []).filter((r) => {
      const illness = r?.Heat_Illness
      if (illness && !enabledSet.has(illness)) return false
      const dt = String(r?.Data_Type || '').trim()
      if (timeMode === 'all_historical') return dt === 'HISTORICAL'
      // 'current' admits both HISTORICAL and FORECAST_2026; the date filter
      // below picks the matching week/month from whichever bucket it falls in.
      return true
    })

    const msDay = 24 * 60 * 60 * 1000

    // Compare by calendar (Y-M-D) anchored to UTC midnight so timezone offsets
    // don't push a selected date before/after the matching week's start.
    let selectedDayMs = NaN
    let selectedYearLocal = null
    let selectedMonthLocal = null
    if (selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime())) {
      selectedYearLocal = selectedDate.getFullYear()
      selectedMonthLocal = selectedDate.getMonth() + 1 // 1-based
      const m = String(selectedMonthLocal).padStart(2, '0')
      const d = String(selectedDate.getDate()).padStart(2, '0')
      selectedDayMs = Date.parse(`${selectedYearLocal}-${m}-${d}T00:00:00Z`)
    }
    if (!Number.isFinite(selectedDayMs)) selectedDayMs = Date.now()

    const inSelectedWeek = (weekStartIso) => {
      try {
        const start = Date.parse(weekStartIso + 'T00:00:00Z')
        if (!Number.isFinite(start)) return false
        return selectedDayMs >= start && selectedDayMs <= start + 6 * msDay
      } catch {
        return false
      }
    }

    const inSelectedMonth = (weekStartIso) => {
      if (!selectedYearLocal || !selectedMonthLocal) return false
      try {
        const m = weekStartIso.match(/^(\d{4})-(\d{2})-\d{2}$/)
        if (!m) return false
        const year = Number(m[1])
        const month = Number(m[2])
        return year === selectedYearLocal && month === selectedMonthLocal
      } catch {
        return false
      }
    }

    const filteredRows = timeMode === 'current'
      ? rows.filter((r) => granularity === 'month'
        ? inSelectedMonth(r?.Week_Start)
        : inSelectedWeek(r?.Week_Start))
      : rows

    const byDistrict = new Map() // district -> { total, byIllness: Map }
    for (const r of filteredRows) {
      const d = String(r?.Council_District ?? '').trim()
      const illness = String(r?.Heat_Illness ?? '').trim()
      const c = Number(r?.Count || 0)
      if (!d || !illness || !Number.isFinite(c)) continue
      const entry = byDistrict.get(d) || { total: 0, byIllness: new Map() }
      entry.total += c
      entry.byIllness.set(illness, (entry.byIllness.get(illness) || 0) + c)
      byDistrict.set(d, entry)
    }

    const base = phoenixCouncilDistrictsGeojson || phoenixCouncilDistrictsCache.current
    if (!base?.features?.length) {
      map.current.getSource('phoenix-council-districts-heatillness').setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const noData = filteredRows.length === 0
    const hasForecast = filteredRows.some((r) => String(r?.Data_Type || '').trim() === 'FORECAST_2026')
    const hasHistorical = filteredRows.some((r) => String(r?.Data_Type || '').trim() === 'HISTORICAL')
    const dataKind = noData ? 'none' : (hasForecast && hasHistorical ? 'mixed' : hasForecast ? 'forecast' : 'historical')

    const derived = {
      type: 'FeatureCollection',
      features: (base.features || []).map((f) => {
        const district = String(f?.properties?.DISTRICT ?? '').trim()
        const entry = byDistrict.get(district) || { total: 0, byIllness: new Map() }
        const breakdown = Array.from(entry.byIllness.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 6)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
        return {
          ...f,
          properties: {
            ...(f.properties || {}),
            heatIllnessCount: entry.total,
            heatIllnessBreakdown: breakdown,
            heatIllnessMode: timeMode,
            heatIllnessGranularity: granularity,
            heatIllnessNoData: noData,
            heatIllnessDataKind: dataKind,
          },
        }
      }),
    }

    map.current.getSource('phoenix-council-districts-heatillness').setData(derived)

    // Villages view: assign each village to a council district (bbox-center point-in-polygon),
    // then inherit the district's totals.
    const baseVillages = phoenixVillagesGeojson || phoenixVillagesCache.current
    if (map.current.getSource('phoenix-villages-heatillness') && baseVillages?.features?.length) {
      const key = `${base?.features?.length || 0}|${baseVillages?.features?.length || 0}`
      let mapping = phoenixVillageToCouncilDistrictRef.current?.key === key ? phoenixVillageToCouncilDistrictRef.current.map : null
      if (!mapping) {
        const districtsPrepared = buildPhoenixCouncilDistrictCfsPrecomputed(base)
        const villagesPrepared = buildPhoenixVillageCfsPrecomputed(baseVillages)
        const out = new Map()
        for (const v of villagesPrepared) {
          const [minX, minY, maxX, maxY] = v.bbox || []
          const cx = (minX + maxX) / 2
          const cy = (minY + maxY) / 2
          let found = null
          for (const d of districtsPrepared) {
            const [dminX, dminY, dmaxX, dmaxY] = d.bbox || []
            if (cx < dminX || cx > dmaxX || cy < dminY || cy > dmaxY) continue
            if (d.ringsList?.some((rings) => pointInPolygonRings(cx, cy, rings))) {
              found = d.districtLabel
              break
            }
          }
          if (v.name && found) out.set(String(v.name), String(found))
        }
        mapping = out
        phoenixVillageToCouncilDistrictRef.current = { key, map: mapping }
      }

      const derivedVillages = {
        type: 'FeatureCollection',
        features: (baseVillages.features || []).map((f) => {
          const name = String(f?.properties?.NAME ?? '').trim()
          const district = mapping?.get(name) || null
          const entry = district ? (byDistrict.get(String(district)) || { total: 0, byIllness: new Map() }) : { total: 0, byIllness: new Map() }
          const breakdown = Array.from(entry.byIllness.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 6)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
          return {
            ...f,
            properties: {
              ...(f.properties || {}),
              heatIllnessCount: entry.total,
              heatIllnessBreakdown: breakdown,
              heatIllnessMode: timeMode,
              heatIllnessGranularity: granularity,
              heatIllnessNoData: noData,
              heatIllnessDataKind: dataKind,
              heatIllnessAssignedDistrict: district,
            },
          }
        }),
      }

      map.current.getSource('phoenix-villages-heatillness').setData(derivedVillages)
    }
  }, [
    selectedCity,
    phoenixHeatIllnessesVisible,
    phoenixHeatIllnessesGeoView,
    phoenixHeatIllnessGeoLabelsVisible,
    phoenixHeatIllnessesTimeMode,
    phoenixHeatIllnessesGranularity,
    phoenixHeatIllnessesEnabled,
    selectedDate,
    phoenixCouncilDistrictsGeojson,
    phoenixVillagesGeojson,
    mapLoaded,
  ])

  // Heat illnesses hover tooltip (synthetic demo)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (selectedCity !== 'phoenix') return
    const geoView = String(phoenixHeatIllnessesGeoView || 'districts')
    const layerId = geoView === 'villages' ? 'phoenix-villages-heatillness-fill' : 'phoenix-council-districts-heatillness-fill'
    if (!map.current.getLayer(layerId)) return

    const ensurePopup = () => {
      if (phoenixHeatIllnessesPopup.current) return phoenixHeatIllnessesPopup.current
      phoenixHeatIllnessesPopup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 })
      return phoenixHeatIllnessesPopup.current
    }

    const onMove = (e) => {
      if (!phoenixHeatIllnessesVisible) return
      const f = e?.features?.[0]
      if (!f) return
      const district = String(f?.properties?.DISTRICT ?? '').trim()
      const villageName = String(f?.properties?.NAME ?? '').trim()
      const assignedDistrict = String(f?.properties?.heatIllnessAssignedDistrict ?? '').trim()
      const total = Number(f?.properties?.heatIllnessCount || 0)
      const breakdown = String(f?.properties?.heatIllnessBreakdown || '').trim()
      const mode = String(f?.properties?.heatIllnessMode || 'current')
      const granularity = String(f?.properties?.heatIllnessGranularity || 'week')
      const noData = !!f?.properties?.heatIllnessNoData
      const dataKind = String(f?.properties?.heatIllnessDataKind || 'none')

      const kindLabel =
        dataKind === 'forecast' ? 'Forecast (modelled)' :
          dataKind === 'mixed' ? 'Forecast + historical' :
            dataKind === 'historical' ? 'Historical' : 'No data'

      const modeLabel = mode === 'all_historical'
        ? `${kindLabel} · all historical (every available week)`
        : (granularity === 'month'
          ? `${kindLabel} · current time (selected month)`
          : `${kindLabel} · current time (selected week)`)

      const periodPhrase = mode === 'all_historical'
        ? 'the historical period'
        : (granularity === 'month' ? 'the selected month' : 'the selected week')

      const breakdownRows = (!noData && breakdown)
        ? breakdown
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const idx = line.lastIndexOf(':')
            if (idx === -1) return { label: line, value: '' }
            return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() }
          })
        : []

      const breakdownHtml = breakdownRows.length
        ? `
          <div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.10); padding-top:8px;">
            <div style="display:flex; justify-content:space-between; gap:12px; font-size:10px; color: rgba(255,255,255,0.70);">
              <div>Illness</div>
              <div style="text-align:right;">Count</div>
            </div>
            <div style="margin-top:6px; display:flex; flex-direction:column; gap:6px;">
              ${breakdownRows.map((r) => `
                <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
                  <div style="font-size:11px; color: rgba(255,255,255,0.88); line-height:1.2;">
                    ${r.label}
                  </div>
                  <div style="font-size:11px; font-weight:700; color: rgba(255,255,255,0.92); text-align:right; white-space:nowrap;">
                    ${r.value}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `
        : ''

      const noDataHtml = noData
        ? `
          <div style="margin-top:8px; padding:8px 10px; border:1px dashed rgba(255,255,255,0.18); border-radius:6px; background:rgba(82,82,91,0.18); font-size:11px; color: rgba(255,255,255,0.85); line-height:1.35;">
            No heat illness data for ${periodPhrase}.
          </div>
        `
        : ''

      const forecastNoteHtml = (!noData && (dataKind === 'forecast' || dataKind === 'mixed')) ? `
        <div style="margin-top:8px; padding:8px 10px; border:1px solid rgba(234,179,8,0.28); border-radius:6px; background:rgba(234,179,8,0.10); font-size:11px; color: rgba(255,255,255,0.88); line-height:1.35;">
          Forecasted values — intended for planning. Not observed counts.
        </div>
      ` : ''

      const totalDisplay = noData ? '—' : (Number.isFinite(total) ? total : 0)

      const html = `
        <div style="min-width: 220px;">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.02em; color: rgba(255,255,255,0.92);">
              ${geoView === 'villages'
                ? `Village ${villageName || '—'} · Heat illnesses${assignedDistrict ? ` <span style="color: rgba(255,255,255,0.55); font-weight:600;">(District ${assignedDistrict})</span>` : ''}`
                : `District ${district} · Heat illnesses`}
            </div>
            <div style="font-size:11px; font-weight:800; color: rgba(255,255,255,0.95); white-space:nowrap;">
              ${totalDisplay}
            </div>
          </div>
          <div style="margin-top:4px; font-size:10px; color: rgba(255,255,255,0.70);">
            ${modeLabel}
          </div>
          ${noDataHtml}
          ${forecastNoteHtml}
          ${breakdownHtml}
        </div>
      `

      ensurePopup().setLngLat(e.lngLat).setHTML(html).addTo(map.current)
    }

    const onLeave = () => {
      if (phoenixHeatIllnessesPopup.current) phoenixHeatIllnessesPopup.current.remove()
    }

    map.current.on('mousemove', layerId, onMove)
    map.current.on('mouseleave', layerId, onLeave)

    return () => {
      if (!map.current) return
      map.current.off('mousemove', layerId, onMove)
      map.current.off('mouseleave', layerId, onLeave)
      if (phoenixHeatIllnessesPopup.current) {
        phoenixHeatIllnessesPopup.current.remove()
        phoenixHeatIllnessesPopup.current = null
      }
    }
  }, [selectedCity, phoenixHeatIllnessesVisible, phoenixHeatIllnessesGeoView, mapLoaded])

  // Heat illnesses hover highlight (council districts)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (selectedCity !== 'phoenix') return
    const geoView = String(phoenixHeatIllnessesGeoView || 'districts')
    const layerId = geoView === 'villages' ? 'phoenix-villages-heatillness-fill' : 'phoenix-council-districts-heatillness-fill'
    const sourceId = geoView === 'villages' ? 'phoenix-villages-heatillness' : 'phoenix-council-districts-heatillness'
    if (!map.current.getLayer(layerId)) return

    const clearHover = () => {
      if (!map.current) return
      if (phoenixHeatIllnessHoverId.current != null) {
        try {
          map.current.setFeatureState(
            { source: sourceId, id: phoenixHeatIllnessHoverId.current },
            { hover: false }
          )
        } catch {}
        phoenixHeatIllnessHoverId.current = null
      }
    }

    const onMove = (e) => {
      if (!phoenixHeatIllnessesVisible) return
      const f = e?.features?.[0]
      const id = f?.id
      if (id == null) {
        clearHover()
        return
      }
      if (phoenixHeatIllnessHoverId.current === id) return
      clearHover()
      phoenixHeatIllnessHoverId.current = id
      try {
        map.current.setFeatureState({ source: sourceId, id }, { hover: true })
      } catch {}
    }

    const onLeave = () => clearHover()

    map.current.on('mousemove', layerId, onMove)
    map.current.on('mouseleave', layerId, onLeave)

    return () => {
      if (!map.current) return
      map.current.off('mousemove', layerId, onMove)
      map.current.off('mouseleave', layerId, onLeave)
      clearHover()
    }
  }, [selectedCity, phoenixHeatIllnessesVisible, phoenixHeatIllnessesGeoView, mapLoaded])

  // Phoenix council districts hover + selection behavior
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (selectedCity !== 'phoenix') return

    const layerId = 'phoenix-council-districts-fill'
    if (!map.current.getLayer(layerId)) return

    const clearHover = () => {
      if (!map.current) return
      if (phoenixCouncilDistrictHoverId.current != null) {
        try {
          map.current.setFeatureState(
            { source: 'phoenix-council-districts', id: phoenixCouncilDistrictHoverId.current },
            { hover: false }
          )
        } catch {}
        phoenixCouncilDistrictHoverId.current = null
      }
    }

    const onMove = (e) => {
      if (!phoenixCouncilDistrictBoundariesVisible) return
      const f = e?.features?.[0]
      const id = f?.id
      if (id == null) {
        clearHover()
        return
      }
      if (phoenixCouncilDistrictHoverId.current === id) return
      clearHover()
      phoenixCouncilDistrictHoverId.current = id
      try {
        map.current.setFeatureState({ source: 'phoenix-council-districts', id }, { hover: true })
      } catch {}
    }

    const onLeave = () => {
      clearHover()
    }

    const onClick = (e) => {
      if (!phoenixCouncilDistrictBoundariesVisible) return
      const f = e?.features?.[0]
      const id = f?.id
      if (id == null) return

      // Clear previous selection
      if (phoenixCouncilDistrictSelectedId.current != null && phoenixCouncilDistrictSelectedId.current !== id) {
        try {
          map.current.setFeatureState(
            { source: 'phoenix-council-districts', id: phoenixCouncilDistrictSelectedId.current },
            { selected: false }
          )
        } catch {}
      }

      const isSame = phoenixCouncilDistrictSelectedId.current === id
      phoenixCouncilDistrictSelectedId.current = isSame ? null : id
      try {
        map.current.setFeatureState({ source: 'phoenix-council-districts', id }, { selected: !isSame })
      } catch {}
    }

    map.current.on('mousemove', layerId, onMove)
    map.current.on('mouseleave', layerId, onLeave)
    map.current.on('click', layerId, onClick)

    return () => {
      if (!map.current) return
      map.current.off('mousemove', layerId, onMove)
      map.current.off('mouseleave', layerId, onLeave)
      map.current.off('click', layerId, onClick)
      clearHover()
    }
  }, [selectedCity, phoenixCouncilDistrictBoundariesVisible, mapLoaded])

  // Phoenix neighborhood boundaries hover + selection behavior
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (selectedCity !== 'phoenix') return

    const layerId = 'phoenix-villages-fill'
    if (!map.current.getLayer(layerId)) return

    const clearHover = () => {
      if (!map.current) return
      if (phoenixVillageHoverId.current != null) {
        try {
          map.current.setFeatureState(
            { source: 'phoenix-villages', id: phoenixVillageHoverId.current },
            { hover: false }
          )
        } catch {}
        phoenixVillageHoverId.current = null
      }
    }

    const onMove = (e) => {
      if (!phoenixNeighborhoodBoundariesVisible) return
      const f = e?.features?.[0]
      const id = f?.id
      if (id == null) {
        clearHover()
        return
      }
      if (phoenixVillageHoverId.current === id) return
      clearHover()
      phoenixVillageHoverId.current = id
      try {
        map.current.setFeatureState({ source: 'phoenix-villages', id }, { hover: true })
      } catch {}
    }

    const onLeave = () => {
      clearHover()
    }

    const onClick = (e) => {
      if (!phoenixNeighborhoodBoundariesVisible) return
      const f = e?.features?.[0]
      const id = f?.id
      if (id == null) return

      if (phoenixVillageSelectedId.current != null && phoenixVillageSelectedId.current !== id) {
        try {
          map.current.setFeatureState(
            { source: 'phoenix-villages', id: phoenixVillageSelectedId.current },
            { selected: false }
          )
        } catch {}
      }

      const isSame = phoenixVillageSelectedId.current === id
      phoenixVillageSelectedId.current = isSame ? null : id
      try {
        map.current.setFeatureState({ source: 'phoenix-villages', id }, { selected: !isSame })
      } catch {}
    }

    map.current.on('mousemove', layerId, onMove)
    map.current.on('mouseleave', layerId, onLeave)
    map.current.on('click', layerId, onClick)

    return () => {
      if (!map.current) return
      map.current.off('mousemove', layerId, onMove)
      map.current.off('mouseleave', layerId, onLeave)
      map.current.off('click', layerId, onClick)
      clearHover()
    }
  }, [selectedCity, phoenixNeighborhoodBoundariesVisible, mapLoaded])

  // Phoenix council districts colored by homelessness counts (affected only)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('phoenix-council-districts-homelessness')) return

    const shouldShow = selectedCity === 'phoenix' && phoenixHomelessnessAffectedNeighborhoodsVisible
    const setVis = (id, vis) => {
      if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis)
    }

    // Keep the old village layers hidden (no longer used by this toggle).
    setVis('phoenix-villages-homelessness-fill', 'none')
    setVis('phoenix-villages-homelessness-border', 'none')

    setVis('phoenix-council-districts-homelessness-fill', shouldShow ? 'visible' : 'none')
    setVis('phoenix-council-districts-homelessness-border', shouldShow ? 'visible' : 'none')

    if (!shouldShow) {
      map.current.getSource('phoenix-council-districts-homelessness').setData({ type: 'FeatureCollection', features: [] })
      return
    }

    // Count homelessness points per council district using point-in-polygon.
    const enabledCats = phoenixHomelessnessCategoryEnabled || {}
    const basePts = phoenixHomelessnessSyntheticPoints || { type: 'FeatureCollection', features: [] }
    const visiblePts = (basePts.features || []).filter((f) => {
      const cat = f?.properties?.category
      if (cat && enabledCats[cat] === false) return false
      return true
    })

    const applyDistricts = (baseDistricts) => {
      if (!map.current || !baseDistricts?.features?.length) {
        if (map.current?.getSource('phoenix-council-districts-homelessness')) {
          map.current.getSource('phoenix-council-districts-homelessness').setData({ type: 'FeatureCollection', features: [] })
        }
        return
      }

      const districtsPrepared = buildPhoenixCouncilDistrictCfsPrecomputed(baseDistricts)

      const counts = new Map()
      const byCatCounts = new Map()
      for (const d of districtsPrepared) {
        counts.set(d.id, 0)
        byCatCounts.set(d.id, new Map())
      }
      for (const f of visiblePts) {
        if (f?.geometry?.type !== 'Point') continue
        const c = f.geometry.coordinates
        if (!Array.isArray(c) || c.length < 2) continue
        const lng = c[0], lat = c[1]
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
        const cat = f?.properties?.category || 'Unknown'
        for (const d of districtsPrepared) {
          const [minX, minY, maxX, maxY] = d.bbox
          if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue
          let hit = false
          for (const rings of d.ringsList) {
            if (pointInPolygonRings(lng, lat, rings)) { hit = true; break }
          }
          if (!hit) continue
          counts.set(d.id, (counts.get(d.id) || 0) + 1)
          const inner = byCatCounts.get(d.id) || new Map()
          inner.set(cat, (inner.get(cat) || 0) + 1)
          byCatCounts.set(d.id, inner)
          break
        }
      }

      const affectedFeatures = baseDistricts.features
        .map((f) => {
          const objectId = String(f?.properties?.OBJECTID ?? f?.id ?? '')
          if (!objectId) return null
          const cnt = counts.get(objectId) || 0
          if (cnt <= 0) return null
          const inner = byCatCounts.get(objectId) || new Map()
          const byCat = Array.from(inner.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([category, count]) => ({ category, count }))
          return {
            ...f,
            properties: {
              ...(f.properties || {}),
              homelessCount: cnt,
              homelessByCategoryJson: JSON.stringify(byCat),
            },
          }
        })
        .filter(Boolean)

      if (map.current?.getSource('phoenix-council-districts-homelessness')) {
        map.current.getSource('phoenix-council-districts-homelessness').setData({
          type: 'FeatureCollection',
          features: affectedFeatures,
        })
      }
    }

    const cached = phoenixCouncilDistrictsGeojson || phoenixCouncilDistrictsCache.current
    if (cached) {
      applyDistricts(cached)
    } else {
      let cancelled = false
      fetch(phoenixCouncilDistrictsUrl)
        .then((r) => r.json())
        .then((geojson) => {
          if (cancelled) return
          phoenixCouncilDistrictsCache.current = geojson
          applyDistricts(geojson)
        })
        .catch((err) => console.warn('Homelessness districts geojson fetch failed:', err))
      return () => { cancelled = true }
    }
  }, [
    selectedCity,
    phoenixHomelessnessAffectedNeighborhoodsVisible,
    phoenixHomelessnessCategoryEnabled,
    phoenixCouncilDistrictsGeojson,
    mapLoaded,
  ])

  // Phoenix villages colored by heat deaths (example per-village counts; daily + correlated with temperature)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('phoenix-villages-heatdeaths')) return

    const shouldShow = selectedCity === 'phoenix' && phoenixHeatDeathsVisible
    const setVis = (id, vis) => {
      if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis)
    }

    setVis('phoenix-villages-heatdeaths-fill', shouldShow ? 'visible' : 'none')
    setVis('phoenix-villages-heatdeaths-border', shouldShow ? 'visible' : 'none')

    const clearChipMarkers = () => {
      for (const m of phoenixHeatDeathsLabelMarkersRef.current) {
        try { m?.remove?.() } catch {}
      }
      phoenixHeatDeathsLabelMarkersRef.current = []
    }

    if (!shouldShow) {
      clearChipMarkers()
      map.current.getSource('phoenix-villages-heatdeaths').setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const baseVillages = phoenixVillagesGeojson || phoenixVillagesCache.current
    if (!baseVillages?.features?.length) {
      clearChipMarkers()
      map.current.getSource('phoenix-villages-heatdeaths').setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const selectedMonthKey = phoenixHeatDeathsTimeline?.months?.[phoenixHeatDeathsTimeline.idx] || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    const monthOffset = Math.max(-6, Math.min(6, phoenixHeatDeathsTimeline.idx - 6))
    const monthMultiplierRaw = phoenixHeatDeathsDailyMultipliers?.[String(monthOffset * 2)] // reuse existing curve, scaled
    const monthMultiplier = Number.isFinite(Number(monthMultiplierRaw)) ? Number(monthMultiplierRaw) : 1
    const K = 0.07 // correlation strength (tempC above threshold increases deaths)
    const T0 = 30 // °C threshold
    const HEAT_SEASON_DAYS = 120 // Option A: baseline is season total → expected daily

    const formatHeatDeaths = (v) => {
      const n = Number(v)
      if (!Number.isFinite(n)) return '—'
      return String(Math.round(n))
    }

    const daysInMonth = (monthKey) => {
      const m = String(monthKey || '')
      const [yStr, mmStr] = m.split('-')
      const y = Number(yStr)
      const mm = Number(mmStr)
      if (!Number.isFinite(y) || !Number.isFinite(mm) || mm < 1 || mm > 12) return 30
      // new Date(y, mm, 0) gives last day of month (mm is 1-based here)
      return new Date(y, mm, 0).getDate()
    }

    const features = (baseVillages.features || []).map((f) => {
      const name = f?.properties?.NAME
      const base = name ? phoenixHeatDeathsByVillage?.[name] : 0
      const baseNum = Number.isFinite(Number(base)) ? Number(base) : 0

      // Correlate with daily average temperature (if available)
      const series = name ? phoenixVillageHourlyTempsCache.current.get(name) : null
      const avgC = getMonthlyAvgTempC(series, selectedMonthKey)
      const factor = Number.isFinite(avgC) ? (1 + K * Math.max(0, avgC - T0)) : 1

      const expectedDaily = (baseNum / Math.max(1, HEAT_SEASON_DAYS)) * monthMultiplier * factor
      const monthlyTotal = expectedDaily * daysInMonth(selectedMonthKey)
      const v = Math.max(0, Math.round(monthlyTotal))
      return {
        ...f,
        properties: {
          ...(f.properties || {}),
          heatDeaths: Number.isFinite(Number(v)) ? Number(v) : 0,
        },
      }
    })

    map.current.getSource('phoenix-villages-heatdeaths').setData({ type: 'FeatureCollection', features })

    // Chip labels
    clearChipMarkers()
    if (phoenixHeatDeathsLabelsVisible) {
      for (const f of features) {
        const center = getGeojsonFeatureCenter(f)
        if (!center) continue
        const deaths = Number(f?.properties?.heatDeaths)
        if (!Number.isFinite(deaths)) continue
        const el = document.createElement('div')
        el.style.pointerEvents = 'none'
        el.style.background = 'rgba(0,0,0,0.70)'
        el.style.border = '1px solid rgba(255,255,255,0.12)'
        el.style.borderRadius = '999px'
        el.style.padding = '4px 8px'
        el.style.boxShadow = '0 8px 18px rgba(0,0,0,0.35)'
        el.style.color = 'rgba(255,255,255,0.92)'
        el.style.fontSize = '11px'
        el.style.fontWeight = '700'
        el.style.letterSpacing = '0.01em'
        el.style.whiteSpace = 'nowrap'
        el.textContent = `Heat Deaths ${formatHeatDeaths(deaths)}`

        const marker = new mapLib.current.Marker({ element: el, anchor: 'center' })
          .setLngLat(center)
          .addTo(map.current)
        phoenixHeatDeathsLabelMarkersRef.current.push(marker)
      }
    }
  }, [
    selectedCity,
    phoenixHeatDeathsVisible,
    phoenixHeatDeathsLabelsVisible,
    phoenixHeatDeathsTimeline.idx,
    phoenixVillagesGeojson,
    mapLoaded,
  ])

  // Phoenix cooling centers (points)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('phoenix-cooling-centers')) return
    if (!map.current.getSource('phoenix-villages-cooling-centers-rag')) return
    if (!map.current.getSource('phoenix-council-districts-cooling-centers-rag')) return

    const shouldShow = selectedCity === 'phoenix' && phoenixCoolingCentersVisible
    const setVis = (id, vis) => {
      if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis)
    }

    // No clustering for cooling centers.
    setVis('phoenix-cooling-centers-clusters', 'none')
    setVis('phoenix-cooling-centers-cluster-count', 'none')
    setVis('phoenix-cooling-centers-points', shouldShow ? 'visible' : 'none')

    const showDistrictRag = shouldShow && phoenixCoolingCentersGeoView === 'districts'
    const showVillageRag = shouldShow && phoenixCoolingCentersGeoView === 'villages'
    setVis('phoenix-council-districts-cooling-centers-rag-fill', showDistrictRag ? 'visible' : 'none')
    setVis('phoenix-council-districts-cooling-centers-rag-border', showDistrictRag ? 'visible' : 'none')
    setVis('phoenix-villages-cooling-centers-rag-fill', showVillageRag ? 'visible' : 'none')
    setVis('phoenix-villages-cooling-centers-rag-border', showVillageRag ? 'visible' : 'none')

    if (!shouldShow) {
      map.current.getSource('phoenix-cooling-centers').setData({ type: 'FeatureCollection', features: [] })
      map.current.getSource('phoenix-villages-cooling-centers-rag').setData({ type: 'FeatureCollection', features: [] })
      map.current.getSource('phoenix-council-districts-cooling-centers-rag').setData({ type: 'FeatureCollection', features: [] })
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const geojson = await buildPhoenixCoolingCentersGeojson()
        if (cancelled) return
        map.current.getSource('phoenix-cooling-centers').setData(geojson)

        const points = geojson?.features || []

        // Villages choropleth
        const baseVillages = phoenixVillagesGeojson || phoenixVillagesCache.current
        if (baseVillages?.features?.length) {
          const pre = buildPhoenixVillageCfsPrecomputed(baseVillages)
          const { counts } = countPointsInVillages(points, pre)
          const max = Math.max(0, ...Array.from(counts.values()))
          const derived = {
            type: 'FeatureCollection',
            features: (baseVillages.features || []).map((f) => {
              const name = String(f?.properties?.NAME ?? '').trim()
              const c = name ? (counts.get(name) || 0) : 0
              const score = max > 0 ? c / max : 0
              return {
                ...f,
                properties: {
                  ...(f.properties || {}),
                  ccCount: c,
                  ccScore: Number.isFinite(score) ? score : 0,
                },
              }
            }),
          }
          map.current.getSource('phoenix-villages-cooling-centers-rag').setData(derived)
        } else {
          map.current.getSource('phoenix-villages-cooling-centers-rag').setData({ type: 'FeatureCollection', features: [] })
        }

        // Districts choropleth
        const baseDistricts = phoenixCouncilDistrictsGeojson || phoenixCouncilDistrictsCache.current
        if (baseDistricts?.features?.length) {
          const pre = buildPhoenixCouncilDistrictCfsPrecomputed(baseDistricts)
          const { counts } = countPointsInVillages(points, pre)
          const max = Math.max(0, ...Array.from(counts.values()))
          const derived = {
            type: 'FeatureCollection',
            features: (baseDistricts.features || []).map((f) => {
              const objectIdRaw = f?.properties?.OBJECTID ?? f?.id
              const objectId = objectIdRaw == null ? '' : String(objectIdRaw)
              const c = objectId ? (counts.get(objectId) || 0) : 0
              const score = max > 0 ? c / max : 0
              return {
                ...f,
                properties: {
                  ...(f.properties || {}),
                  ccCount: c,
                  ccScore: Number.isFinite(score) ? score : 0,
                },
              }
            }),
          }
          map.current.getSource('phoenix-council-districts-cooling-centers-rag').setData(derived)
        } else {
          map.current.getSource('phoenix-council-districts-cooling-centers-rag').setData({ type: 'FeatureCollection', features: [] })
        }
      } catch {
        if (cancelled) return
        map.current.getSource('phoenix-cooling-centers').setData({ type: 'FeatureCollection', features: [] })
        map.current.getSource('phoenix-villages-cooling-centers-rag').setData({ type: 'FeatureCollection', features: [] })
        map.current.getSource('phoenix-council-districts-cooling-centers-rag').setData({ type: 'FeatureCollection', features: [] })
      }
    })()

    return () => { cancelled = true }
  }, [
    selectedCity,
    phoenixCoolingCentersVisible,
    phoenixCoolingCentersGeoView,
    phoenixVillagesGeojson,
    phoenixCouncilDistrictsGeojson,
    mapLoaded,
  ])

  useEffect(() => {
    let cancelled = false
    if (selectedCity !== 'phoenix' || !phoenixCoolingCentersVisible) {
      setPhoenixCoolingCentersCoverage(null)
      return
    }
    ;(async () => {
      try {
        const cov = await getPhoenixCoolingCentersHistoricalCoverage()
        if (!cancelled) setPhoenixCoolingCentersCoverage(cov)
      } catch {
        if (!cancelled) setPhoenixCoolingCentersCoverage(null)
      }
    })()
    return () => { cancelled = true }
  }, [selectedCity, phoenixCoolingCentersVisible])

  // Phoenix council districts colored by temperature (citywide hourly value projected to districts)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('phoenix-council-districts-temperature')) return

    const shouldShow = selectedCity === 'phoenix' && phoenixTemperatureNeighborhoodsVisible
    const setVis = (id, vis) => {
      if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis)
    }

    setVis('phoenix-council-districts-temperature-fill', shouldShow ? 'visible' : 'none')
    setVis('phoenix-council-districts-temperature-border', shouldShow ? 'visible' : 'none')
    setVis('phoenix-council-districts-temperature-labels', shouldShow && phoenixTemperatureNeighborhoodsLabelsVisible ? 'visible' : 'none')

    if (!shouldShow) {
      map.current.getSource('phoenix-council-districts-temperature').setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const baseDistricts = phoenixCouncilDistrictsGeojson || phoenixCouncilDistrictsCache.current
    if (!baseDistricts?.features?.length) {
      map.current.getSource('phoenix-council-districts-temperature').setData({ type: 'FeatureCollection', features: [] })
      return
    }

    let cancelled = false

    const TEMP_ARCHIVE_START = '2024-01-01'

    const computeArchiveEndYmd = () => {
      const now = new Date()
      const archiveEnd = new Date(now)
      // Avoid duplicated hours with forecast endpoint past_days=92.
      archiveEnd.setDate(archiveEnd.getDate() - 93)
      return `${archiveEnd.getFullYear()}-${String(archiveEnd.getMonth() + 1).padStart(2, '0')}-${String(archiveEnd.getDate()).padStart(2, '0')}`
    }

    const loadDistrictSeries = async ({ districtId, lng, lat }) => {
      const archiveEndYmd = computeArchiveEndYmd()
      const cached = await getPhoenixDistrictTempsCache(districtId)
      const cachedSeries = cached?.series
      const cachedMeta = cached?.meta || {}

      const needArchive = String(cachedMeta.archiveEndYmd || '') !== String(archiveEndYmd)
      const needForecast = !cachedSeries?.times?.length || isForecastStale(cachedMeta.forecast, 6 * 60 * 60 * 1000)

      let archiveSeries = null
      if (needArchive && archiveEndYmd >= TEMP_ARCHIVE_START) {
        try {
          archiveSeries = await fetchArchiveHourlyTemps({
            lng,
            lat,
            startYmd: TEMP_ARCHIVE_START,
            endYmd: archiveEndYmd,
          })
        } catch {
          archiveSeries = null
        }
      }

      let forecastSeries = null
      try {
        if (needForecast) {
          forecastSeries = await fetchForecastHourlyTemps({
            lng,
            lat,
            pastDays: 92,
            forecastDays: 16,
          })
        }
      } catch {
        forecastSeries = null
      }

      const merged = mergeHourlySeries([needArchive ? archiveSeries : cachedSeries, forecastSeries].filter(Boolean))
      const meta = {
        archiveEndYmd,
        archive: { fetchedAtMs: needArchive ? Date.now() : Number(cachedMeta?.archive?.fetchedAtMs || 0) },
        forecast: { fetchedAtMs: needForecast ? Date.now() : Number(cachedMeta?.forecast?.fetchedAtMs || 0) },
      }
      await setPhoenixDistrictTempsCache(districtId, { series: merged, meta })
      return merged
    }

    const run = async () => {
      const features = baseDistricts.features
      const dayKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
      const noonPrefix = `${dayKey}T12:`

      const out = []
      for (const f of features) {
        if (cancelled) return
        const districtId = String(f?.properties?.DISTRICT ?? '').trim()
        const center = getPolygonCentroidLngLat(f)
        if (!districtId || !center) continue
        const [lng, lat] = center
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue

        const series = await loadDistrictSeries({ districtId, lng, lat })
        if (cancelled) return
        if (!series?.times?.length || !series?.tempsC?.length) continue

        let idx = series.times.findIndex((t) => String(t || '').startsWith(noonPrefix))
        if (idx < 0) {
          // Fallback: daily average for that district point.
          let sum = 0
          let n = 0
          for (let i = 0; i < series.times.length; i++) {
            const t = String(series.times[i] || '')
            if (!t.startsWith(dayKey)) continue
            const v = Number(series.tempsC[i])
            if (!Number.isFinite(v)) continue
            sum += v
            n += 1
          }
          const avgC = n ? (sum / n) : null
          const avgF = Number.isFinite(avgC) ? (avgC * 9) / 5 + 32 : null
          const avgFInt = Number.isFinite(avgF) ? Math.round(avgF) : null
          out.push({
            ...f,
            properties: {
              ...(f.properties || {}),
              tempAvgC: Number.isFinite(avgC) ? avgC : null,
              tempF: Number.isFinite(avgFInt) ? avgFInt : null,
            },
          })
          continue
        }

        const v = series.tempsC?.[idx]
        const tempAvgC = Number.isFinite(v) ? v : null
        const tempF = Number.isFinite(tempAvgC) ? (tempAvgC * 9) / 5 + 32 : null
        const tempFInt = Number.isFinite(tempF) ? Math.round(tempF) : null
        out.push({
          ...f,
          properties: {
            ...(f.properties || {}),
            tempAvgC: Number.isFinite(tempAvgC) ? tempAvgC : null,
            tempF: Number.isFinite(tempFInt) ? tempFInt : null,
          },
        })
      }

      if (cancelled) return
      map.current.getSource('phoenix-council-districts-temperature').setData({
        type: 'FeatureCollection',
        features: out,
      })
    }

    run()
    return () => { cancelled = true }
  }, [
    selectedCity,
    phoenixTemperatureNeighborhoodsVisible,
    phoenixTemperatureNeighborhoodsLabelsVisible,
    phoenixCouncilDistrictsGeojson,
    mapLoaded,
    selectedDate,
  ])

  const formatHeatDeathsDayLabel = (dayKey) => {
    const d = new Date(`${dayKey}T00:00:00`)
    if (Number.isNaN(d.getTime())) return dayKey
    const today = new Date()
    const isToday =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}, ${y}/${m}/${dd}`
  }

  useEffect(() => {
    if (selectedCity !== 'phoenix') return
    if (!phoenixHeatDeathsVisible) return
    const today = new Date()
    const months = []
    const base = new Date(today.getFullYear(), today.getMonth(), 1)
    for (let i = -6; i <= 6; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      months.push(`${y}-${m}`)
    }
    setPhoenixHeatDeathsTimeline((prev) => ({ status: 'ready', months, idx: 6 }))
  }, [selectedCity, phoenixHeatDeathsVisible])

  const getDailyAvgTempC = (series, dayKey) => {
    if (!series?.times?.length || !series?.tempsC?.length) return null
    let sum = 0
    let n = 0
    for (let i = 0; i < series.times.length; i++) {
      const t = String(series.times[i] || '')
      if (!t.startsWith(dayKey)) continue
      const v = Number(series.tempsC[i])
      if (!Number.isFinite(v)) continue
      sum += v
      n += 1
    }
    if (!n) return null
    return sum / n
  }

  const getMonthlyAvgTempC = (series, monthKey) => {
    if (!series?.times?.length || !series?.tempsC?.length) return null
    let sum = 0
    let n = 0
    for (let i = 0; i < series.times.length; i++) {
      const t = String(series.times[i] || '')
      // times are ISO like 2026-04-21T13:00; monthKey is YYYY-MM
      if (!t.startsWith(monthKey)) continue
      const v = Number(series.tempsC[i])
      if (!Number.isFinite(v)) continue
      sum += v
      n += 1
    }
    if (!n) return null
    return sum / n
  }

  // Phoenix Calls for Service — set data and visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('phoenix-cfs-flat') || !map.current.getSource('phoenix-cfs-clustered')) return

    // Hide point/cluster/heatmap layers when a boundary choropleth mode is active (dots replaced by polygons).
    const shouldShowPoints =
      selectedCity === 'phoenix' &&
      callsForServiceVisible &&
      !phoenixVillagesCfsRagVisible &&
      !phoenixCouncilDistrictsCfsRagVisible
    const style = callsForServiceStyle || 'default'

    const typesEnabled = callsForServiceTypes || {}
    const enabledTypes = Object.keys(typesEnabled).filter((t) => typesEnabled[t] !== false)

    const baseData = callsForServiceGeojson || { type: 'FeatureCollection', features: [] }
    const filtered = enabledTypes.length
      ? {
          type: 'FeatureCollection',
          features: baseData.features.filter((f) => enabledTypes.includes(f?.properties?.finalCallType)),
        }
      : { type: 'FeatureCollection', features: [] }

    map.current.getSource('phoenix-cfs-flat').setData(filtered)
    map.current.getSource('phoenix-cfs-clustered').setData(filtered)

    const setVis = (id, vis) => {
      if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis)
    }

    // Hide all by default
    ;['phoenix-cfs-clusters','phoenix-cfs-cluster-count','phoenix-cfs-unclustered','phoenix-cfs-points','phoenix-cfs-heatmap','phoenix-cfs-heatmap-points'].forEach((id) => setVis(id, 'none'))

    if (!shouldShowPoints) return

    if (style === 'heatmap') {
      setVis('phoenix-cfs-heatmap', 'visible')
      setVis('phoenix-cfs-heatmap-points', 'visible')
    } else if (style === 'cluster') {
      setVis('phoenix-cfs-clusters', 'visible')
      setVis('phoenix-cfs-cluster-count', 'visible')
      setVis('phoenix-cfs-unclustered', 'visible')
    } else {
      // Default = dots only
      setVis('phoenix-cfs-points', 'visible')
    }
  }, [selectedCity, callsForServiceVisible, phoenixVillagesCfsRagVisible, phoenixCouncilDistrictsCfsRagVisible, callsForServiceStyle, callsForServiceTypes, callsForServiceGeojson, mapLoaded])

  // Phoenix villages — Calls for Service density (RAG choropleth; point-in-polygon)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('phoenix-villages-cfs-rag')) return

    const setVis = (id, vis) => {
      if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis)
    }

    const blockedByOtherPhoenixBoundaryOverlays =
      phoenixNeighborhoodBoundariesVisible ||
      phoenixCouncilDistrictBoundariesVisible ||
      phoenixHomelessnessAffectedNeighborhoodsVisible

    const shouldShow =
      selectedCity === 'phoenix' &&
      phoenixVillagesCfsRagVisible &&
      callsForServiceVisible &&
      !blockedByOtherPhoenixBoundaryOverlays

    const vis = shouldShow ? 'visible' : 'none'
    setVis('phoenix-villages-cfs-rag-fill', vis)
    setVis('phoenix-villages-cfs-rag-border', vis)

    if (!shouldShow) {
      map.current.getSource('phoenix-villages-cfs-rag').setData({ type: 'FeatureCollection', features: [] })
      if (phoenixVillagesCfsRagPopup.current) {
        phoenixVillagesCfsRagPopup.current.remove()
        phoenixVillagesCfsRagPopup.current = null
      }
      return
    }

    const typesEnabled = callsForServiceTypes || {}
    const enabledTypes = Object.keys(typesEnabled).filter((t) => typesEnabled[t] !== false)
    const baseData = callsForServiceGeojson || { type: 'FeatureCollection', features: [] }
    const filteredPoints = enabledTypes.length
      ? baseData.features.filter((f) => enabledTypes.includes(f?.properties?.finalCallType))
      : []

    const applyForBaseVillages = (baseVillages) => {
      if (!map.current || !map.current.getSource('phoenix-villages-cfs-rag')) return
      if (!baseVillages?.features?.length) {
        map.current.getSource('phoenix-villages-cfs-rag').setData({ type: 'FeatureCollection', features: [] })
        return
      }

      const key = baseVillages
      let precomputed = phoenixVillagesCfsPrepared.current?.key === key ? phoenixVillagesCfsPrepared.current.prepared : null
      if (!precomputed) {
        precomputed = buildPhoenixVillageCfsPrecomputed(baseVillages)
        phoenixVillagesCfsPrepared.current = { key, prepared: precomputed }
      }

      const { counts, byType } = countPointsInVillages(filteredPoints, precomputed)
      const derived = {
        type: 'FeatureCollection',
        features: (baseVillages.features || []).map((f) => {
          const name = f?.properties?.NAME
          const c = name ? (counts.get(String(name)) || 0) : 0
          const inner = name ? (byType.get(String(name)) || new Map()) : new Map()
          const top = Array.from(inner.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 6)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
          return {
            ...f,
            properties: {
              ...(f.properties || {}),
              cfsCount: c,
              cfsBreakdown: top,
            },
          }
        }),
      }
      map.current.getSource('phoenix-villages-cfs-rag').setData(derived)
    }

    const base = phoenixVillagesGeojson || phoenixVillagesCache.current
    if (base) {
      applyForBaseVillages(base)
      return
    }

    fetch(phoenixVillagesUrl)
      .then((r) => r.json())
      .then((geojson) => {
        phoenixVillagesCache.current = geojson
        applyForBaseVillages(geojson)
      })
      .catch((err) => {
        console.warn('Phoenix villages fetch failed (CFS RAG):', err)
        if (map.current.getSource('phoenix-villages-cfs-rag')) {
          map.current.getSource('phoenix-villages-cfs-rag').setData({ type: 'FeatureCollection', features: [] })
        }
      })
  }, [
    selectedCity,
    phoenixVillagesCfsRagVisible,
    callsForServiceVisible,
    phoenixNeighborhoodBoundariesVisible,
    phoenixCouncilDistrictBoundariesVisible,
    phoenixHomelessnessAffectedNeighborhoodsVisible,
    callsForServiceTypes,
    callsForServiceGeojson,
    phoenixVillagesGeojson,
    mapLoaded,
  ])

  // Phoenix council districts — Calls for Service density (RAG choropleth; point-in-polygon)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('phoenix-council-districts-cfs-rag')) return

    const setVis = (id, vis) => {
      if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis)
    }

    const blockedByOtherPhoenixBoundaryOverlays =
      phoenixNeighborhoodBoundariesVisible ||
      phoenixCouncilDistrictBoundariesVisible ||
      phoenixHomelessnessAffectedNeighborhoodsVisible ||
      phoenixVillagesCfsRagVisible

    const shouldShow =
      selectedCity === 'phoenix' &&
      phoenixCouncilDistrictsCfsRagVisible &&
      callsForServiceVisible &&
      !blockedByOtherPhoenixBoundaryOverlays

    const vis = shouldShow ? 'visible' : 'none'
    setVis('phoenix-council-districts-cfs-rag-fill', vis)
    setVis('phoenix-council-districts-cfs-rag-border', vis)

    if (!shouldShow) {
      map.current.getSource('phoenix-council-districts-cfs-rag').setData({ type: 'FeatureCollection', features: [] })
      if (phoenixCouncilDistrictsCfsRagPopup.current) {
        phoenixCouncilDistrictsCfsRagPopup.current.remove()
        phoenixCouncilDistrictsCfsRagPopup.current = null
      }
      return
    }

    const typesEnabled = callsForServiceTypes || {}
    const enabledTypes = Object.keys(typesEnabled).filter((t) => typesEnabled[t] !== false)
    const baseData = callsForServiceGeojson || { type: 'FeatureCollection', features: [] }
    const filteredPoints = enabledTypes.length
      ? baseData.features.filter((f) => enabledTypes.includes(f?.properties?.finalCallType))
      : []

    const applyForBaseDistricts = (baseDistricts) => {
      if (!map.current || !map.current.getSource('phoenix-council-districts-cfs-rag')) return
      if (!baseDistricts?.features?.length) {
        map.current.getSource('phoenix-council-districts-cfs-rag').setData({ type: 'FeatureCollection', features: [] })
        return
      }

      const key = baseDistricts
      let precomputed = phoenixCouncilDistrictsCfsPrepared.current?.key === key ? phoenixCouncilDistrictsCfsPrepared.current.prepared : null
      if (!precomputed) {
        precomputed = buildPhoenixCouncilDistrictCfsPrecomputed(baseDistricts)
        phoenixCouncilDistrictsCfsPrepared.current = { key, prepared: precomputed }
      }

      const { counts, byType } = countPointsInVillages(filteredPoints, precomputed)
      const derived = {
        type: 'FeatureCollection',
        features: (baseDistricts.features || []).map((f) => {
          const objectIdRaw = f?.properties?.OBJECTID ?? f?.id
          const objectId = objectIdRaw == null ? '' : String(objectIdRaw)
          const c = objectId ? (counts.get(objectId) || 0) : 0
          const inner = objectId ? (byType.get(objectId) || new Map()) : new Map()
          const top = Array.from(inner.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 6)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')

          const districtRaw = f?.properties?.DISTRICT ?? f?.properties?.District ?? f?.properties?.district
          const district = String(districtRaw ?? '').trim()
          const label = district ? `District ${district}` : 'Council District'

          return {
            ...f,
            properties: {
              ...(f.properties || {}),
              cfsCount: c,
              cfsBreakdown: top,
              cfsLabel: label,
            },
          }
        }),
      }
      map.current.getSource('phoenix-council-districts-cfs-rag').setData(derived)
    }

    const base = phoenixCouncilDistrictsGeojson || phoenixCouncilDistrictsCache.current
    if (base) {
      applyForBaseDistricts(base)
      return
    }

    fetch(phoenixCouncilDistrictsUrl)
      .then((r) => r.json())
      .then((geojson) => {
        phoenixCouncilDistrictsCache.current = geojson
        applyForBaseDistricts(geojson)
      })
      .catch((err) => {
        console.warn('Phoenix council districts fetch failed (CFS RAG):', err)
        if (map.current.getSource('phoenix-council-districts-cfs-rag')) {
          map.current.getSource('phoenix-council-districts-cfs-rag').setData({ type: 'FeatureCollection', features: [] })
        }
      })
  }, [
    selectedCity,
    phoenixCouncilDistrictsCfsRagVisible,
    phoenixVillagesCfsRagVisible,
    callsForServiceVisible,
    phoenixNeighborhoodBoundariesVisible,
    phoenixCouncilDistrictBoundariesVisible,
    phoenixHomelessnessAffectedNeighborhoodsVisible,
    callsForServiceTypes,
    callsForServiceGeojson,
    phoenixCouncilDistrictsGeojson,
    mapLoaded,
  ])

  // Phoenix villages — CFS RAG hover tooltip
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (selectedCity !== 'phoenix') return
    const layerId = 'phoenix-villages-cfs-rag-fill'
    if (!map.current.getLayer(layerId)) return

    const ensurePopup = () => {
      if (phoenixVillagesCfsRagPopup.current) return phoenixVillagesCfsRagPopup.current
      phoenixVillagesCfsRagPopup.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
        maxWidth: '420px',
      })
      return phoenixVillagesCfsRagPopup.current
    }

    const onMove = (e) => {
      if (!phoenixVillagesCfsRagVisible || !callsForServiceVisible) return
      if (
        phoenixNeighborhoodBoundariesVisible ||
        phoenixCouncilDistrictBoundariesVisible ||
        phoenixHomelessnessAffectedNeighborhoodsVisible
      ) return
      const f = e?.features?.[0]
      if (!f) return
      const name = String(f?.properties?.NAME || '').trim() || 'Village'
      const total = Number(f?.properties?.cfsCount || 0)
      const breakdown = String(f?.properties?.cfsBreakdown || '').trim()

      const breakdownRows = breakdown
        ? breakdown
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const idx = line.lastIndexOf(':')
            if (idx === -1) return { label: line, value: '' }
            return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() }
          })
        : []

      const breakdownHtml = breakdownRows.length
        ? `
          <div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.10); padding-top:8px;">
            <div style="display:flex; justify-content:space-between; gap:12px; font-size:10px; color: rgba(255,255,255,0.70);">
              <div>Call type</div>
              <div style="text-align:right;">Count</div>
            </div>
            <div style="margin-top:6px; display:flex; flex-direction:column; gap:6px;">
              ${breakdownRows.map((r) => `
                <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
                  <div style="font-size:11px; color: rgba(255,255,255,0.88); line-height:1.2; flex:1; min-width:0; word-break:break-word;">
                    ${r.label}
                  </div>
                  <div style="font-size:11px; font-weight:700; color: rgba(255,255,255,0.92); text-align:right; white-space:nowrap;">
                    ${r.value}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `
        : ''

      const html = `
        <div style="display:inline-block; width:max-content; max-width:420px;">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.02em; color: rgba(255,255,255,0.92); flex:1; min-width:0; word-break:break-word;">
              ${name} · Calls for Service
            </div>
            <div style="font-size:11px; font-weight:800; color: rgba(255,255,255,0.95); white-space:nowrap;">
              ${Number.isFinite(total) ? total : 0}
            </div>
          </div>
          <div style="margin-top:4px; font-size:10px; color: rgba(255,255,255,0.70);">
            Filtered by your enabled call types
          </div>
          ${breakdownHtml}
        </div>
      `
      ensurePopup().setLngLat(e.lngLat).setHTML(html).addTo(map.current)
    }

    const onLeave = () => {
      if (phoenixVillagesCfsRagPopup.current) phoenixVillagesCfsRagPopup.current.remove()
    }

    map.current.on('mousemove', layerId, onMove)
    map.current.on('mouseleave', layerId, onLeave)

    return () => {
      if (!map.current) return
      map.current.off('mousemove', layerId, onMove)
      map.current.off('mouseleave', layerId, onLeave)
      if (phoenixVillagesCfsRagPopup.current) {
        phoenixVillagesCfsRagPopup.current.remove()
        phoenixVillagesCfsRagPopup.current = null
      }
    }
  }, [
    selectedCity,
    phoenixVillagesCfsRagVisible,
    callsForServiceVisible,
    phoenixNeighborhoodBoundariesVisible,
    phoenixCouncilDistrictBoundariesVisible,
    phoenixHomelessnessAffectedNeighborhoodsVisible,
    mapLoaded,
  ])

  // Phoenix council districts — CFS RAG hover tooltip
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (selectedCity !== 'phoenix') return
    const layerId = 'phoenix-council-districts-cfs-rag-fill'
    if (!map.current.getLayer(layerId)) return

    const ensurePopup = () => {
      if (phoenixCouncilDistrictsCfsRagPopup.current) return phoenixCouncilDistrictsCfsRagPopup.current
      phoenixCouncilDistrictsCfsRagPopup.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
        maxWidth: '420px',
      })
      return phoenixCouncilDistrictsCfsRagPopup.current
    }

    const onMove = (e) => {
      if (!phoenixCouncilDistrictsCfsRagVisible || !callsForServiceVisible) return
      if (
        phoenixNeighborhoodBoundariesVisible ||
        phoenixCouncilDistrictBoundariesVisible ||
        phoenixHomelessnessAffectedNeighborhoodsVisible ||
        phoenixVillagesCfsRagVisible
      ) return
      const f = e?.features?.[0]
      if (!f) return

      const label = String(f?.properties?.cfsLabel || '').trim() || 'Council District'
      const total = Number(f?.properties?.cfsCount || 0)
      const breakdown = String(f?.properties?.cfsBreakdown || '').trim()

      const breakdownRows = breakdown
        ? breakdown
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const idx = line.lastIndexOf(':')
            if (idx === -1) return { label: line, value: '' }
            return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() }
          })
        : []

      const breakdownHtml = breakdownRows.length
        ? `
          <div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.10); padding-top:8px;">
            <div style="display:flex; justify-content:space-between; gap:12px; font-size:10px; color: rgba(255,255,255,0.70);">
              <div>Call type</div>
              <div style="text-align:right;">Count</div>
            </div>
            <div style="margin-top:6px; display:flex; flex-direction:column; gap:6px;">
              ${breakdownRows.map((r) => `
                <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
                  <div style="font-size:11px; color: rgba(255,255,255,0.88); line-height:1.2; flex:1; min-width:0; word-break:break-word;">
                    ${r.label}
                  </div>
                  <div style="font-size:11px; font-weight:700; color: rgba(255,255,255,0.92); text-align:right; white-space:nowrap;">
                    ${r.value}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `
        : ''

      const html = `
        <div style="display:inline-block; width:max-content; max-width:420px;">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.02em; color: rgba(255,255,255,0.92); flex:1; min-width:0; word-break:break-word;">
              ${label} · Calls for Service
            </div>
            <div style="font-size:11px; font-weight:800; color: rgba(255,255,255,0.95); white-space:nowrap;">
              ${Number.isFinite(total) ? total : 0}
            </div>
          </div>
          <div style="margin-top:4px; font-size:10px; color: rgba(255,255,255,0.70);">
            Filtered by your enabled call types
          </div>
          ${breakdownHtml}
        </div>
      `
      ensurePopup().setLngLat(e.lngLat).setHTML(html).addTo(map.current)
    }

    const onLeave = () => {
      if (phoenixCouncilDistrictsCfsRagPopup.current) phoenixCouncilDistrictsCfsRagPopup.current.remove()
    }

    map.current.on('mousemove', layerId, onMove)
    map.current.on('mouseleave', layerId, onLeave)

    return () => {
      if (!map.current) return
      map.current.off('mousemove', layerId, onMove)
      map.current.off('mouseleave', layerId, onLeave)
      if (phoenixCouncilDistrictsCfsRagPopup.current) {
        phoenixCouncilDistrictsCfsRagPopup.current.remove()
        phoenixCouncilDistrictsCfsRagPopup.current = null
      }
    }
  }, [
    selectedCity,
    phoenixCouncilDistrictsCfsRagVisible,
    phoenixVillagesCfsRagVisible,
    callsForServiceVisible,
    phoenixNeighborhoodBoundariesVisible,
    phoenixCouncilDistrictBoundariesVisible,
    phoenixHomelessnessAffectedNeighborhoodsVisible,
    mapLoaded,
  ])

  // Phoenix council districts — CFS RAG hover highlight
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (selectedCity !== 'phoenix') return
    const layerId = 'phoenix-council-districts-cfs-rag-fill'
    if (!map.current.getLayer(layerId)) return

    const clearHover = () => {
      if (!map.current) return
      if (phoenixCouncilDistrictsCfsRagHoverId.current != null) {
        try {
          map.current.setFeatureState(
            { source: 'phoenix-council-districts-cfs-rag', id: phoenixCouncilDistrictsCfsRagHoverId.current },
            { hover: false }
          )
        } catch {}
        phoenixCouncilDistrictsCfsRagHoverId.current = null
      }
    }

    const onMove = (e) => {
      if (!phoenixCouncilDistrictsCfsRagVisible || !callsForServiceVisible) return
      if (
        phoenixNeighborhoodBoundariesVisible ||
        phoenixCouncilDistrictBoundariesVisible ||
        phoenixHomelessnessAffectedNeighborhoodsVisible ||
        phoenixVillagesCfsRagVisible
      ) return
      const f = e?.features?.[0]
      const id = f?.id
      if (id == null) {
        clearHover()
        return
      }
      if (phoenixCouncilDistrictsCfsRagHoverId.current === id) return
      clearHover()
      phoenixCouncilDistrictsCfsRagHoverId.current = id
      try {
        map.current.setFeatureState({ source: 'phoenix-council-districts-cfs-rag', id }, { hover: true })
      } catch {}
    }

    const onLeave = () => clearHover()

    map.current.on('mousemove', layerId, onMove)
    map.current.on('mouseleave', layerId, onLeave)

    return () => {
      if (!map.current) return
      map.current.off('mousemove', layerId, onMove)
      map.current.off('mouseleave', layerId, onLeave)
      clearHover()
    }
  }, [
    selectedCity,
    phoenixCouncilDistrictsCfsRagVisible,
    phoenixVillagesCfsRagVisible,
    callsForServiceVisible,
    phoenixNeighborhoodBoundariesVisible,
    phoenixCouncilDistrictBoundariesVisible,
    phoenixHomelessnessAffectedNeighborhoodsVisible,
    mapLoaded,
  ])

  // Phoenix villages — CFS RAG hover highlight
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (selectedCity !== 'phoenix') return
    const layerId = 'phoenix-villages-cfs-rag-fill'
    if (!map.current.getLayer(layerId)) return

    const clearHover = () => {
      if (!map.current) return
      if (phoenixVillagesCfsRagHoverId.current != null) {
        try {
          map.current.setFeatureState(
            { source: 'phoenix-villages-cfs-rag', id: phoenixVillagesCfsRagHoverId.current },
            { hover: false }
          )
        } catch {}
        phoenixVillagesCfsRagHoverId.current = null
      }
    }

    const onMove = (e) => {
      if (!phoenixVillagesCfsRagVisible || !callsForServiceVisible) return
      if (
        phoenixNeighborhoodBoundariesVisible ||
        phoenixCouncilDistrictBoundariesVisible ||
        phoenixHomelessnessAffectedNeighborhoodsVisible
      ) return
      const f = e?.features?.[0]
      const id = f?.id
      if (id == null) {
        clearHover()
        return
      }
      if (phoenixVillagesCfsRagHoverId.current === id) return
      clearHover()
      phoenixVillagesCfsRagHoverId.current = id
      try {
        map.current.setFeatureState({ source: 'phoenix-villages-cfs-rag', id }, { hover: true })
      } catch {}
    }

    const onLeave = () => clearHover()

    map.current.on('mousemove', layerId, onMove)
    map.current.on('mouseleave', layerId, onLeave)

    return () => {
      if (!map.current) return
      map.current.off('mousemove', layerId, onMove)
      map.current.off('mouseleave', layerId, onLeave)
      clearHover()
    }
  }, [
    selectedCity,
    phoenixVillagesCfsRagVisible,
    callsForServiceVisible,
    phoenixNeighborhoodBoundariesVisible,
    phoenixCouncilDistrictBoundariesVisible,
    phoenixHomelessnessAffectedNeighborhoodsVisible,
    mapLoaded,
  ])

  // (Citywide homelessness marker removed — synthetic scattered points only)

  // Phoenix homelessness services — hardcoded synthetic points + view mode (baseline)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('phoenix-homelessness-synthetic')) return
    if (!map.current.getSource('phoenix-homelessness-clustered')) return

    const shouldShow = selectedCity === 'phoenix' && phoenixHomelessnessVisible
    const setVis = (id, vis) => {
      if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', vis)
    }

    const style = callsForServiceStyle || 'default'

    // Hide all homelessness layers by default
    ;[
      'phoenix-homelessness-synthetic-points',
      'phoenix-homelessness-clusters',
      'phoenix-homelessness-cluster-count',
      'phoenix-homelessness-unclustered',
      'phoenix-homelessness-heatmap',
      'phoenix-homelessness-heatmap-points',
    ].forEach((id) => setVis(id, 'none'))

    if (!shouldShow) {
      map.current.getSource('phoenix-homelessness-synthetic').setData({ type: 'FeatureCollection', features: [] })
      map.current.getSource('phoenix-homelessness-clustered').setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const enabledCats = phoenixHomelessnessCategoryEnabled || {}

    const base = phoenixHomelessnessSyntheticPoints || { type: 'FeatureCollection', features: [] }
    const filtered = {
      type: 'FeatureCollection',
      features: (base.features || []).filter((f) => {
        const cat = f?.properties?.category
        if (cat && enabledCats[cat] === false) return false
        return true
      }),
    }

    map.current.getSource('phoenix-homelessness-synthetic').setData(filtered)
    map.current.getSource('phoenix-homelessness-clustered').setData(filtered)

    if (style === 'heatmap') {
      setVis('phoenix-homelessness-heatmap', 'visible')
      setVis('phoenix-homelessness-heatmap-points', 'visible')
    } else if (style === 'cluster') {
      setVis('phoenix-homelessness-clusters', 'visible')
      setVis('phoenix-homelessness-cluster-count', 'visible')
      setVis('phoenix-homelessness-unclustered', 'visible')
    } else {
      setVis('phoenix-homelessness-synthetic-points', 'visible')
    }
  }, [selectedCity, phoenixHomelessnessVisible, phoenixHomelessnessCategoryEnabled, callsForServiceStyle, mapLoaded])

  // Baltimore neighborhoods - filter and color-code by 311 density
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getLayer('baltimore-neighborhoods-fill')) return
    if (selectedCity !== 'baltimore') return
    if (!baltimoreNeighborhoodsData) return
    
    const baltimore311Data = map.current.getSource('baltimore-311-flat')?._data
    
    // Calculate density of open 311 requests per neighborhood
    let densityMap = {}
    if (baltimore311Data && baltimore311Data.features) {
      const enabledTypes = Object.keys(baltimore311Types).filter(t => baltimore311Types[t])
      const filtered311Data = {
        type: 'FeatureCollection',
        features: baltimore311Data.features.filter(f => {
          const srType = f?.properties?.SRType
          return srType && enabledTypes.includes(srType)
        })
      }
      densityMap = calculateNeighborhood311Density(baltimoreNeighborhoodsData, filtered311Data, baltimore311HideClosed)
    }
    
    // Determine which neighborhoods to show
    let filteredData = { type: 'FeatureCollection', features: [] }
    
    if (baltimoreNeighborhoodsAffected) {
      // Show only neighborhoods with open 311 requests
      filteredData.features = baltimoreNeighborhoodsData.features.filter(f => {
        const name = f.properties.Name
        if (!name) return false
        const count = densityMap[name] || 0
        return count > 0
      })
    } else if (baltimoreNeighborhoodsAll) {
      // Show all neighborhoods
      filteredData.features = baltimoreNeighborhoodsData.features
    }
    
    map.current.getSource('baltimore-neighborhoods').setData(filteredData)
    
    // Apply color expressions based on 311 density
    map.current.setPaintProperty('baltimore-neighborhoods-fill', 'fill-color', getNeighborhoodColorExpression(densityMap))
    map.current.setPaintProperty('baltimore-neighborhoods-border', 'line-color', getNeighborhoodBorderExpression(densityMap))
    
    // Show layers if either toggle is enabled
    const shouldShow = baltimoreNeighborhoodsAffected || baltimoreNeighborhoodsAll
    const visibility = shouldShow ? 'visible' : 'none'
    map.current.setLayoutProperty('baltimore-neighborhoods-fill', 'visibility', visibility)
    map.current.setLayoutProperty('baltimore-neighborhoods-border', 'visibility', visibility)
    map.current.setLayoutProperty('baltimore-neighborhoods-labels', 'visibility', visibility)
  }, [baltimoreNeighborhoodsAffected, baltimoreNeighborhoodsAll, baltimoreNeighborhoodsData, selectedCity, mapLoaded, baltimore311Types, baltimore311HideClosed, selectedYear, selectedDate])

  // Baltimore neighborhoods - floating stats cards for top 4 affected
  useEffect(() => {
    if (!map.current || !mapLoaded || !mapLib.current) return
    if (selectedCity !== 'baltimore') {
      // Clear markers when not in Baltimore
      neighborhoodMarkers.current.forEach(({ pin, card }) => {
        pin?.remove()
        card?.remove()
      })
      neighborhoodMarkers.current = []
      setMinimizedCards({})
      return
    }
    if (!baltimoreNeighborhoodsAffected) {
      // Only show cards when "Show Affected Neighborhoods" is enabled
      neighborhoodMarkers.current.forEach(({ pin, card }) => {
        pin?.remove()
        card?.remove()
      })
      neighborhoodMarkers.current = []
      setMinimizedCards({})
      return
    }
    if (!baltimoreNeighborhoodsData) return

    // Get full 311 data from source
    const baltimore311Data = map.current.getSource('baltimore-311-flat')?._data
    if (!baltimore311Data || !baltimore311Data.features) return

    // Calculate density with current filters
    const enabledTypes = Object.keys(baltimore311Types).filter(t => baltimore311Types[t])
    const filtered311Data = {
      type: 'FeatureCollection',
      features: baltimore311Data.features.filter(f => {
        const srType = f?.properties?.SRType
        return srType && enabledTypes.includes(srType)
      })
    }
    const densityMap = calculateNeighborhood311Density(baltimoreNeighborhoodsData, filtered311Data, baltimore311HideClosed)

    // Get top 4 neighborhoods with detailed stats
    const topNeighborhoods = getTopNeighborhoods(densityMap, baltimoreNeighborhoodsData, baltimore311Data, {
      hideClosed: baltimore311HideClosed,
      topN: 4
    })

    // Clear existing markers
    neighborhoodMarkers.current.forEach(({ pin, card }) => {
      pin?.remove()
      card?.remove()
    })
    neighborhoodMarkers.current = []

    // Create new pin + card markers for top neighborhoods
    topNeighborhoods.forEach(neighborhood => {
      if (!neighborhood.centroid) return

      const neighborhoodName = neighborhood.name

      // Create PIN marker
      const pinDiv = document.createElement('div')
      const pinRoot = createRoot(pinDiv)
      pinRoot.render(
        <NeighborhoodPin 
          color={neighborhood.color} 
          onClick={() => {
            // When pin is clicked, show the card (un-minimize)
            setMinimizedCards(prev => ({
              ...prev,
              [neighborhoodName]: false
            }))
          }}
        />
      )

      const pinMarker = new mapLib.current.Marker({
        element: pinDiv,
        anchor: 'bottom',
        offset: [0, 0]
      })
        .setLngLat(neighborhood.centroid)
        .addTo(map.current)

      // Create CARD marker
      const cardDiv = document.createElement('div')
      const cardRoot = createRoot(cardDiv)
      
      // Function to re-render the card with updated minimize state
      const renderCard = (isMinimized) => {
        cardRoot.render(
          <NeighborhoodStatsCard 
            neighborhood={neighborhood} 
            isMinimized={isMinimized}
            onMinimize={() => {
              // When card minimize is clicked, hide the card
              setMinimizedCards(prev => ({
                ...prev,
                [neighborhoodName]: true
              }))
            }}
          />
        )
      }

      // Initial render (check if this card was previously minimized)
      const isInitiallyMinimized = minimizedCards[neighborhoodName] || false
      renderCard(isInitiallyMinimized)

      const cardMarker = new mapLib.current.Marker({
        element: cardDiv,
        anchor: 'bottom',
        offset: [0, -40] // Position above the pin
      })
        .setLngLat(neighborhood.centroid)
        .addTo(map.current)

      // Store both markers
      neighborhoodMarkers.current.push({
        pin: pinMarker,
        card: cardMarker,
        name: neighborhoodName,
        renderCard // Store render function to update later
      })
    })

    // Cleanup on unmount
    return () => {
      neighborhoodMarkers.current.forEach(({ pin, card }) => {
        pin?.remove()
        card?.remove()
      })
      neighborhoodMarkers.current = []
    }
  }, [
    mapLoaded, 
    selectedCity, 
    baltimoreNeighborhoodsAffected,
    baltimoreNeighborhoodsData,
    baltimore311Types,
    baltimore311HideClosed,
    selectedYear,
    selectedDate
  ])

  // Re-render cards when minimizedCards state changes
  useEffect(() => {
    neighborhoodMarkers.current.forEach(({ name, renderCard }) => {
      if (renderCard) {
        const isMinimized = minimizedCards[name] || false
        renderCard(isMinimized)
      }
    })
  }, [minimizedCards])

  // Baltimore 311 — auto-load when city is Baltimore, switch between styles
  useEffect(() => {
    console.log('🚀 311 effect triggered:', { 
      hasMap: !!map.current, 
      mapLoaded, 
      selectedCity,
      hasClusterLayer: map.current?.getLayer('baltimore-311-clusters') ? 'yes' : 'no'
    })
    
    if (!map.current || !mapLoaded) {
      console.log('⏸️ 311 effect: map not ready yet')
      return
    }
    if (!map.current.getLayer('baltimore-311-clusters')) {
      console.log('⏸️ 311 effect: cluster layer not found yet')
      return
    }

    const CLUSTER_LAYERS = ['baltimore-311-clusters', 'baltimore-311-cluster-count', 'baltimore-311-unclustered']
    const FLAT_LAYERS = ['baltimore-311-points']
    const HEATMAP_LAYERS = ['baltimore-311-heatmap', 'baltimore-311-heatmap-points']
    const ALL_311_LAYERS = [...CLUSTER_LAYERS, ...FLAT_LAYERS, ...HEATMAP_LAYERS]
    const isBaltimore = selectedCity === 'baltimore'

    if (!isBaltimore) {
      ALL_311_LAYERS.forEach(id =>
        map.current.setLayoutProperty(id, 'visibility', 'none')
      )
      return
    }

    const applyVisibility = () => {
      // Hide all layers first
      ALL_311_LAYERS.forEach(id =>
        map.current.setLayoutProperty(id, 'visibility', 'none')
      )
      
      console.log('🔍 applyVisibility called:', { 
        baltimore311Visible, 
        baltimore311Style, 
        typesCount: Object.keys(baltimore311Types).length 
      })
      
      // Only show layers if baltimore311Visible is true
      if (!baltimore311Visible) {
        console.log('❌ baltimore311Visible is false, not showing layers')
        return
      }
      
      // Show appropriate layers based on style
      if (baltimore311Style === 'cluster') {
        console.log('✅ Showing CLUSTER_LAYERS')
        CLUSTER_LAYERS.forEach(id =>
          map.current.setLayoutProperty(id, 'visibility', 'visible')
        )
      } else if (baltimore311Style === 'heatmap') {
        console.log('✅ Showing HEATMAP_LAYERS')
        HEATMAP_LAYERS.forEach(id =>
          map.current.setLayoutProperty(id, 'visibility', 'visible')
        )
      } else {
        // default
        console.log('✅ Showing FLAT_LAYERS (default style)')
        FLAT_LAYERS.forEach(id =>
          map.current.setLayoutProperty(id, 'visibility', 'visible')
        )
      }
    }

    const filterByTypes = (geojson) => {
      const enabledTypes = Object.keys(baltimore311Types).filter(t => baltimore311Types[t])
      // If no types have been initialized yet, don't filter by type (show all)
      if (Object.keys(baltimore311Types).length === 0) {
        return geojson
      }
      // If types are initialized but all disabled, return empty
      if (enabledTypes.length === 0) {
        return { type: 'FeatureCollection', features: [] }
      }
      return {
        ...geojson,
        features: geojson.features.filter(f => enabledTypes.includes(f.properties.SRType)),
      }
    }

    const filterByClosed = (geojson) => {
      // If hide closed is enabled, filter out requests with a CloseDate
      if (!baltimore311HideClosed) return geojson
      
      const asOfDate = new Date(selectedDate)
      asOfDate.setHours(23, 59, 59, 999)
      const asOfTime = asOfDate.getTime()
      
      return {
        ...geojson,
        features: geojson.features.filter(f => {
          // Keep requests that are still open (no CloseDate)
          // OR were closed after the selected date
          const closeTime = f.properties?.CloseDate
          return !closeTime || closeTime > asOfTime
        }),
      }
    }

    // Generate cache key from selected date (YYYY-MM-DD format)
    const getCacheKey = () => {
      if (!selectedDate) return selectedYear.toString()
      const d = new Date(selectedDate)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    const applyAllFilters = (geojson) => {
      // Apply filters in order: types -> closed status
      const typeFiltered = filterByTypes(geojson)
      return filterByClosed(typeFiltered)
    }

    const cacheKey = getCacheKey()
    
    // Use cached data for this date
    if (baltimore311Cache.current[cacheKey]) {
      const fullData = baltimore311Cache.current[cacheKey]
      setBaltimore311Data(fullData)
      setBaltimore311DataYear(selectedYear)
      const filteredData = applyAllFilters(fullData)
      map.current.getSource('baltimore-311-clustered').setData(filteredData)
      map.current.getSource('baltimore-311-flat').setData(filteredData)
      applyVisibility()
      return
    }

    // Fetch for this date (with server-side date filtering)
    console.log('🌐 Fetching 311 data for', selectedYear, selectedDate, 'cache key:', cacheKey)
    fetch(get311ServiceUrl(selectedYear, selectedDate))
      .then((r) => {
        console.log('📡 311 fetch response received')
        return r.json()
      })
      .then((geojson) => {
        console.log('✅ 311 data parsed:', geojson.features?.length, 'features')
        baltimore311Cache.current[cacheKey] = geojson
        setBaltimore311Data(geojson)
        setBaltimore311DataYear(selectedYear)
        const filteredData = applyAllFilters(geojson)
        console.log('📊 Filtered data:', filteredData.features?.length, 'features after filters')
        if (map.current) {
          map.current.getSource('baltimore-311-clustered').setData(filteredData)
          map.current.getSource('baltimore-311-flat').setData(filteredData)
          applyVisibility()
        }
      })
      .catch((err) => {
        console.error('❌ 311 fetch failed:', err)
        ;[...CLUSTER_LAYERS, ...FLAT_LAYERS].forEach(id =>
          map.current?.setLayoutProperty(id, 'visibility', 'none')
        )
      })
  }, [selectedCity, selectedYear, selectedDate, baltimore311Style, baltimore311Visible, baltimore311HideClosed, baltimore311Types, mapLoaded, setBaltimore311Data, setBaltimore311DataYear]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update heatmap properties in real-time when config changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (
      !map.current.getLayer('baltimore-311-heatmap') &&
      !map.current.getLayer('phoenix-cfs-heatmap') &&
      !map.current.getLayer('phoenix-homelessness-heatmap')
    ) return

    const applyToLayer = (layerId) => {
      if (!map.current?.getLayer(layerId)) return
      map.current.setPaintProperty(layerId, 'heatmap-weight', heatmapConfig.weight)
      map.current.setPaintProperty(layerId, 'heatmap-intensity', [
        'interpolate', ['linear'], ['zoom'],
        0, heatmapConfig.intensityMin,
        15, heatmapConfig.intensityMax,
      ])
      map.current.setPaintProperty(layerId, 'heatmap-radius', [
        'interpolate', ['linear'], ['zoom'],
        0, heatmapConfig.radiusMin,
        15, heatmapConfig.radiusMax,
      ])
      map.current.setPaintProperty(layerId, 'heatmap-opacity', [
        'interpolate', ['linear'], ['zoom'],
        14, heatmapConfig.opacity,
        15, 0,
      ])
    }

    // Update heatmap layer properties (Baltimore 311 + Phoenix Calls for Service)
    applyToLayer('baltimore-311-heatmap')
    applyToLayer('phoenix-cfs-heatmap')
    applyToLayer('phoenix-homelessness-heatmap')
  }, [heatmapConfig, mapLoaded])

  // ========== HEALTH DATA LOADING ==========
  // Load overdose and naloxone data when Baltimore is selected
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!map.current.getSource('health-overdose')) return
    
    const isBaltimore = selectedCity === 'baltimore'
    
    if (!isBaltimore) {
      // Hide health layers when not in Baltimore
      map.current.setLayoutProperty('health-overdose-points', 'visibility', 'none')
      map.current.setLayoutProperty('health-naloxone-points', 'visibility', 'none')
      return
    }
    
    // Filter overdose data by date and filters
    const filterOverdoseData = (data) => {
      const asOfDate = new Date(selectedDate)
      asOfDate.setHours(23, 59, 59, 999)
      const asOfTime = asOfDate.getTime()
      
      return {
        ...data,
        features: data.features.filter(f => {
          // Filter by date (show incidents up to selected date)
          if (f.properties.incidentDate > asOfTime) return false
          
          // Filter by enabled filters
          if (Object.keys(healthOverdoseFilters).length > 0) {
            // Check substance filter
            const substanceKey = `substance:${f.properties.substance}`
            if (healthOverdoseFilters[substanceKey] === false) return false
            
            // Check outcome filter
            const outcomeKey = `outcome:${f.properties.outcome}`
            if (healthOverdoseFilters[outcomeKey] === false) return false
            
            // Check age group filter
            const ageKey = `ageGroup:${f.properties.ageGroup}`
            if (healthOverdoseFilters[ageKey] === false) return false
            
            // Check race filter
            const raceKey = `race:${f.properties.race}`
            if (healthOverdoseFilters[raceKey] === false) return false
            
            // Check sex filter
            const sexKey = `sex:${f.properties.sex}`
            if (healthOverdoseFilters[sexKey] === false) return false
          }
          
          return true
        })
      }
    }
    
    // Filter naloxone data by date and filters
    const filterNaloxoneData = (data) => {
      const asOfDate = new Date(selectedDate)
      asOfDate.setHours(23, 59, 59, 999)
      const asOfTime = asOfDate.getTime()
      
      return {
        ...data,
        features: data.features.filter(f => {
          // Filter by date
          if (f.properties.distributionDate > asOfTime) return false
          
          // Filter by location type
          if (Object.keys(healthNaloxoneFilters).length > 0) {
            const typeKey = `locationType:${f.properties.locationType}`
            if (healthNaloxoneFilters[typeKey] === false) return false
          }
          
          return true
        })
      }
    }
    
    // Load data for selected year
    const yearData = {
      overdose: overdoseData[selectedYear] || { type: 'FeatureCollection', features: [] },
      naloxone: naloxoneData[selectedYear] || { type: 'FeatureCollection', features: [] },
    }
    
    const filteredOverdose = filterOverdoseData(yearData.overdose)
    const filteredNaloxone = filterNaloxoneData(yearData.naloxone)
    
    // Update context
    setHealthOverdoseData(yearData.overdose)
    setHealthNaloxoneData(yearData.naloxone)
    setHealthDataYear(selectedYear)
    
    // Update map sources
    map.current.getSource('health-overdose').setData(filteredOverdose)
    map.current.getSource('health-naloxone').setData(filteredNaloxone)
    
    // Update visibility
    map.current.setLayoutProperty('health-overdose-points', 'visibility', healthOverdoseVisible ? 'visible' : 'none')
    map.current.setLayoutProperty('health-naloxone-points', 'visibility', healthNaloxoneVisible ? 'visible' : 'none')
    
  }, [
    selectedCity, 
    selectedYear, 
    selectedDate, 
    healthOverdoseVisible, 
    healthNaloxoneVisible, 
    healthOverdoseFilters, 
    healthNaloxoneFilters, 
    mapLoaded,
    setHealthOverdoseData,
    setHealthNaloxoneData,
    setHealthDataYear,
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {(() => {
        const now = new Date()
        const isValid = selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime())
        if (!isValid) return null

        const msDay = 24 * 60 * 60 * 1000
        const toUtcDayMs = (d) => {
          const y = d.getFullYear()
          const m = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')
          return Date.parse(`${y}-${m}-${dd}T00:00:00Z`)
        }

        const selectedDayMs = toUtcDayMs(selectedDate)
        const findMatchingWeekStartMs = (dt) => {
          for (const r of phoenixHeatIllnessesSyntheticDemo?.rows || []) {
            if (String(r?.Data_Type || '').trim() !== dt) continue
            const ws = r?.Week_Start
            if (!ws) continue
            const start = Date.parse(ws + 'T00:00:00Z')
            if (!Number.isFinite(start)) continue
            if (selectedDayMs >= start && selectedDayMs <= start + 6 * msDay) return start
          }
          return null
        }

        const histWeekStartMs = Number.isFinite(selectedDayMs) ? findMatchingWeekStartMs('HISTORICAL') : null
        const fcstWeekStartMs = Number.isFinite(selectedDayMs) ? findMatchingWeekStartMs('FORECAST_2026') : null
        const hasHistorical = histWeekStartMs != null
        const hasForecast = fcstWeekStartMs != null

        const cmp = (() => {
          if (selectedDate.getFullYear() !== now.getFullYear()) return selectedDate.getFullYear() > now.getFullYear() ? 1 : -1
          if (selectedDate.getMonth() !== now.getMonth()) return selectedDate.getMonth() > now.getMonth() ? 1 : -1
          if (selectedDate.getDate() !== now.getDate()) return selectedDate.getDate() > now.getDate() ? 1 : -1
          return 0
        })()

        const isPhoenixCalls = selectedCity === 'phoenix' && phoenixActiveMasterLayer === 'calls'
        const isPhoenixTemperature = selectedCity === 'phoenix' && !!phoenixTemperatureNeighborhoodsVisible
        const isPhoenixCoolingCenters = selectedCity === 'phoenix' && !!phoenixCoolingCentersVisible
        const isAggHistorical =
          selectedCity === 'phoenix' &&
          !!phoenixHeatIllnessesVisible &&
          String(phoenixHeatIllnessesTimeMode || 'current') === 'all_historical'

        const historicalCoverage = (() => {
          if (!isAggHistorical) return null
          let minStart = null
          let maxStart = null
          for (const r of phoenixHeatIllnessesSyntheticDemo?.rows || []) {
            if (String(r?.Data_Type || '').trim() !== 'HISTORICAL') continue
            const ws = String(r?.Week_Start || '').trim()
            if (!ws) continue
            if (!minStart || ws < minStart) minStart = ws
            if (!maxStart || ws > maxStart) maxStart = ws
          }
          if (!minStart || !maxStart) return null
          const minMs = Date.parse(minStart + 'T00:00:00Z')
          const maxMs = Date.parse(maxStart + 'T00:00:00Z')
          if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return null
          const start = new Date(minMs)
          const end = new Date(maxMs + 6 * msDay)
          const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          return `${startStr}–${endStr}`
        })()

        const label = isPhoenixCalls
          ? 'Historical Data'
          : isPhoenixCoolingCenters
            ? 'Historical'
            : isAggHistorical
            ? 'Historical'
            : (cmp > 0 ? 'Forecast' : cmp < 0 ? 'Historical' : 'Today')
        const periodTag = (() => {
          if (isPhoenixCalls) return null
          if (selectedCity !== 'phoenix') return null
          if (!phoenixHeatIllnessesVisible) return null
          if (String(phoenixHeatIllnessesTimeMode || 'current') !== 'current') return null

          const gran = String(phoenixHeatIllnessesGranularity || 'week')
          if (gran === 'month') {
            return selectedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          }
          const startMs = fcstWeekStartMs ?? histWeekStartMs
          if (!Number.isFinite(startMs)) return null
          const start = new Date(startMs)
          const end = new Date(startMs + 6 * msDay)
          const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          return `${startStr}–${endStr}`
        })()
        const subtitle = (() => {
          if (isPhoenixCalls) {
            if (phoenixCallsForServiceMinDate instanceof Date && phoenixCallsForServiceMaxDate instanceof Date) {
              const startStr = phoenixCallsForServiceMinDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              const endStr = phoenixCallsForServiceMaxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              return `${startStr}–${endStr}`
            }
            return null
          }
          if (isPhoenixTemperature) {
            if (label === 'Today') return 'Live temperature data available'
            if (label === 'Forecast') return 'Open‑Meteo forecast (16 days)'
            // Historical: show the selected day
            return selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          }
          if (isPhoenixCoolingCenters) {
            return phoenixCoolingCentersCoverage
          }
          if (isAggHistorical) return historicalCoverage
          if (label === 'Today') {
            return (hasHistorical || hasForecast) ? null : 'No Live Data Available'
          }
          if (label === 'Historical') {
            return hasHistorical ? null : 'No historical data available'
          }
          // Forecast
          return hasForecast ? 'ML driven forecasting using XGBoost' : 'No forecast data available'
        })()

        const accent =
          label === 'Forecast' ? 'rgba(234,179,8,0.95)'
            : (label === 'Historical' || label === 'Historical Data') ? 'rgba(45,212,191,0.95)'
              : 'rgba(148,163,184,0.95)' // slate for "Today"

        return (
          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: 'calc(var(--nav-height) + 14px)',
              // Keep above map, below floating UI windows/panels.
              zIndex: 20,
              pointerEvents: 'none',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                padding: subtitle ? '10px 14px' : '8px 14px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.22)',
                background: 'rgba(0, 0, 0, 0.62)',
                backdropFilter: 'blur(10px) saturate(160%)',
                boxShadow: `0 14px 34px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.35), 0 0 22px ${accent.replace('0.95', '0.20')}`,
                color: 'rgba(255,255,255,0.96)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                maxWidth: 'min(560px, calc(100vw - 32px))',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: accent, boxShadow: `0 0 0 2px rgba(0,0,0,0.35), 0 0 10px ${accent.replace('0.95', '0.35')}` }} />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  <span>{label}</span>
                  {periodTag ? (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'none', color: 'rgba(255,255,255,0.78)' }}>
                      {periodTag}
                    </span>
                  ) : null}
                </div>
                {subtitle ? (
                  <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.82)', letterSpacing: '0.01em', textTransform: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {subtitle}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )
      })()}
      <div
        ref={mapContainer}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
      />
      {((selectedCity === 'baltimore' && baltimore311Style === 'heatmap') || (selectedCity === 'phoenix' && callsForServiceStyle === 'heatmap')) && (
        <HeatmapLegend />
      )}

      {selectedCity === 'phoenix' &&
        phoenixActiveMasterLayer === 'calls' &&
        callsForServiceVisible &&
        !phoenixVillagesCfsRagVisible &&
        !phoenixCouncilDistrictsCfsRagVisible &&
        callsForServiceStyle === 'default' && (
        <DraggableFloatingPanel
          storageKey="phoenix:legend:calls"
          defaultPosition={{ x: 80, y: 560 }}
          zIndex={50}
        >
          <CallsForServiceLegend />
        </DraggableFloatingPanel>
      )}

      {selectedCity === 'phoenix' && phoenixTemperatureNeighborhoodsVisible && (
        <DraggableFloatingPanel
          storageKey="phoenix:legend:temperature"
          defaultPosition={{ x: 80, y: 440 }}
          zIndex={50}
        >
          <TemperatureLegend />
        </DraggableFloatingPanel>
      )}

      <HeatHomelessnessLegend />

      {selectedCity === 'phoenix' && phoenixHeatDeathsVisible && phoenixHeatDeathsTimeline?.months?.length > 0 && (
        <div
          style={{
            position: 'fixed',
            left: 24,
            right: 24,
            bottom: phoenixTemperatureNeighborhoodsVisible ? 84 : 18,
            zIndex: 60,
            pointerEvents: 'none',
          }}
        >
          {(() => {
            const monthKey = phoenixHeatDeathsTimeline.months[phoenixHeatDeathsTimeline.idx]
            const monthMs = new Date(`${monthKey}-01T00:00:00`).getTime()
            const now = new Date()
            const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
            const thisMonthMs = new Date(`${thisMonthKey}-01T00:00:00`).getTime()
            const mode = Number.isFinite(monthMs) && monthMs > thisMonthMs ? 'forecast' : 'history'
            const monthsCount = phoenixHeatDeathsTimeline.months.length
            const pct = monthsCount > 1 ? phoenixHeatDeathsTimeline.idx / (monthsCount - 1) : 0

            const showEvery = viewportWidth < 640 ? 3 : viewportWidth < 1024 ? 2 : 1

            const setIdxFromPct = (p) => {
              const clamped = Math.max(0, Math.min(1, p))
              const idx = Math.round(clamped * Math.max(0, monthsCount - 1))
              setPhoenixHeatDeathsTimeline((prev) => ({ ...prev, idx }))
            }

            const formatMonthLabel = (k) => {
              const d = new Date(`${k}-01T00:00:00`)
              return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            }

            return (
              <div
                className={`tl-scrubber ${mode === 'forecast' ? 'tl-scrubber--forecast' : 'tl-scrubber--history'}`}
                style={{
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  height: 'var(--tl-height)',
                }}
              >
                <button
                  type="button"
                  className="tl-btn"
                  aria-label="Previous month"
                  onClick={() => setPhoenixHeatDeathsTimeline((prev) => ({ ...prev, idx: Math.max(0, (prev.idx || 0) - 1) }))}
                >
                  Previous
                </button>

                <button
                  type="button"
                  className="tl-date"
                  onClick={() => phoenixHeatDeathsDateInputRef.current?.showPicker?.() || phoenixHeatDeathsDateInputRef.current?.click?.()}
                  aria-label="Change date"
                >
                  {formatMonthLabel(monthKey)}
                </button>
                <input
                  ref={phoenixHeatDeathsDateInputRef}
                  type="month"
                  className="tl-date-input"
                  value={monthKey}
                  onChange={(e) => {
                    const nextKey = e.target.value
                    const idx = phoenixHeatDeathsTimeline.months.indexOf(nextKey)
                    if (idx >= 0) setPhoenixHeatDeathsTimeline((prev) => ({ ...prev, idx }))
                  }}
                />

                <span className={`tl-mode ${mode === 'forecast' ? 'tl-mode--forecast' : 'tl-mode--history'}`}>
                  {mode === 'forecast' ? 'Forecast' : 'History'}
                </span>

                <div
                  className="tl-rail"
                  ref={phoenixHeatDeathsRailRef}
                  onPointerDown={(e) => {
                    phoenixHeatDeathsDragRef.current.dragging = true
                    e.currentTarget.setPointerCapture?.(e.pointerId)
                    const rect = phoenixHeatDeathsRailRef.current?.getBoundingClientRect?.()
                    if (!rect) return
                    setIdxFromPct((e.clientX - rect.left) / Math.max(1, rect.width))
                  }}
                  onPointerMove={(e) => {
                    if (!phoenixHeatDeathsDragRef.current.dragging) return
                    const rect = phoenixHeatDeathsRailRef.current?.getBoundingClientRect?.()
                    if (!rect) return
                    setIdxFromPct((e.clientX - rect.left) / Math.max(1, rect.width))
                  }}
                  onPointerUp={() => { phoenixHeatDeathsDragRef.current.dragging = false }}
                  onPointerCancel={() => { phoenixHeatDeathsDragRef.current.dragging = false }}
                  onPointerLeave={() => { phoenixHeatDeathsDragRef.current.dragging = false }}
                >
                  <div className="tl-ticks" style={{ gridTemplateColumns: `repeat(${monthsCount}, 1fr)` }}>
                    {phoenixHeatDeathsTimeline.months.map((k, i) => {
                      const isActive = i === phoenixHeatDeathsTimeline.idx
                      const show = i % showEvery === 0 || i === 0 || i === monthsCount - 1 || isActive
                      return (
                        <button
                          key={k}
                          type="button"
                          className={`tl-tick ${isActive ? 'tl-tick--active' : ''}`}
                          style={{ display: show ? 'block' : 'none' }}
                          onClick={() => setPhoenixHeatDeathsTimeline((prev) => ({ ...prev, idx: i }))}
                          aria-label={`Jump to ${k}`}
                        >
                          {new Date(`${k}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' })}
                        </button>
                      )
                    })}
                  </div>

                  <div
                    className="tl-thumb"
                    role="slider"
                    tabIndex={0}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(0, monthsCount - 1)}
                    aria-valuenow={phoenixHeatDeathsTimeline.idx}
                    aria-label={`Heat deaths month scrubber, ${formatMonthLabel(monthKey)}`}
                    style={{ left: `calc(${(pct * 100).toFixed(4)}% - 6px)` }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowLeft') { e.preventDefault(); setPhoenixHeatDeathsTimeline((p) => ({ ...p, idx: Math.max(0, (p.idx || 0) - 1) })) }
                      if (e.key === 'ArrowRight') { e.preventDefault(); setPhoenixHeatDeathsTimeline((p) => ({ ...p, idx: Math.min((p.months?.length || 1) - 1, (p.idx || 0) + 1) })) }
                      if (e.key === 'Home') { e.preventDefault(); setPhoenixHeatDeathsTimeline((p) => ({ ...p, idx: 0 })) }
                      if (e.key === 'End') { e.preventDefault(); setPhoenixHeatDeathsTimeline((p) => ({ ...p, idx: Math.max(0, (p.months?.length || 1) - 1) })) }
                    }}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture?.(e.pointerId)
                      phoenixHeatDeathsDragRef.current.dragging = true
                      const rect = phoenixHeatDeathsRailRef.current?.getBoundingClientRect?.()
                      if (!rect) return
                      setIdxFromPct((e.clientX - rect.left) / Math.max(1, rect.width))
                    }}
                    onPointerMove={(e) => {
                      if (!phoenixHeatDeathsDragRef.current.dragging) return
                      const rect = phoenixHeatDeathsRailRef.current?.getBoundingClientRect?.()
                      if (!rect) return
                      setIdxFromPct((e.clientX - rect.left) / Math.max(1, rect.width))
                    }}
                    onPointerUp={() => { phoenixHeatDeathsDragRef.current.dragging = false }}
                    onPointerCancel={() => { phoenixHeatDeathsDragRef.current.dragging = false }}
                  />
                </div>

                <button
                  type="button"
                  className="tl-btn"
                  aria-label="Next month"
                  onClick={() => setPhoenixHeatDeathsTimeline((prev) => ({ ...prev, idx: Math.min((prev.months?.length || 1) - 1, (prev.idx || 0) + 1) }))}
                >
                  Next
                </button>
              </div>
            )
          })()}
        </div>
      )}

    </>
  )
}

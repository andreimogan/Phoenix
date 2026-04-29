import { createContext, useContext, useEffect, useState } from 'react'
import { sendChatMessage } from '../services/openai-chat'
import { idbGet, idbSet } from '../utils/idb'
import {
  CALLS_FOR_SERVICE_CACHE_KEY,
  CALLS_FOR_SERVICE_GEOJSON_KEY,
  CALLS_FOR_SERVICE_META_KEY,
  normalizeAddress,
  groupCallsByBucket,
  parseCallsForServiceCsv,
  sha256Hex,
} from '../utils/callsForService'
import { geocodeQueue, getCachedGeocodeByNormalized } from '../utils/locationIq'
import callsForServiceSeedUrl from '../../External Datasets/calls-for-service_2026-calls-for-service_callsforsrvc2026.csv?url'
import cfsGeocodes from '../data/callsForServiceGeocodes.json'
import phoenixHomelessnessSeedUrl from '../../External Datasets/PhoenixHomelesness.csv?url'
import { getPhoenixHomelessnessSnapshot, parsePhoenixHomelessnessCsv } from '../utils/phoenixHomelessness'
import phoenixVillagesUrl from '../../External Datasets/Villages.geojson?url'
import phoenixCouncilDistrictsUrl from '../../External Datasets/Phoenix_Council_district.geojson?url'
import phoenixHeatDeathsByVillage from '../data/phoenixHeatDeathsByVillage.json'
import phoenixHeatIllnessesSyntheticDemo from '../data/phoenixHeatIllnessesSyntheticDemo.json'

const PanelContext = createContext()

export const usePanelContext = () => {
  const context = useContext(PanelContext)
  if (!context) {
    throw new Error('usePanelContext must be used within PanelProvider')
  }
  return context
}

export const PanelProvider = ({ children }) => {
  // Panel visibility
  const [copilotVisible, setCopilotVisible] = useState(false)
  const [layersVisible, setLayersVisible] = useState(false)

  // Floating windows (right side)
  const [phoenixWeatherWindowVisible, setPhoenixWeatherWindowVisible] = useState(true)
  const [phoenixLatest311WindowVisible, setPhoenixLatest311WindowVisible] = useState(false)
  const [phoenixInterventionWindowVisible, setPhoenixInterventionWindowVisible] = useState(false)
  const [phoenixBriefingRoomVisible, setPhoenixBriefingRoomVisible] = useState(false)
  const [kpiCardsVisible, setKpiCardsVisible] = useState(true)

  // Right-side windows order (based on enable sequence)
  // Allowed ids: 'weather' | 'latest311' | 'intervention' | 'briefingRoom'
  const [rightWindowsOrder, setRightWindowsOrder] = useState(() => (phoenixWeatherWindowVisible ? ['weather'] : []))

  // Right-side windows collapsed state (minimized)
  const [rightWindowsCollapsed, setRightWindowsCollapsed] = useState({
    weather: false,
    latest311: false,
    intervention: false,
    briefingRoom: false,
  })

  const toggleRightWindowCollapsed = (id) => {
    const key = String(id || '')
    if (!key) return
    setRightWindowsCollapsed((prev) => ({ ...(prev || {}), [key]: !prev?.[key] }))
  }

  const toggleRightWindow = (id) => {
    const key = String(id || '')
    if (!key) return

    const setVisibleById = (nextVisible) => {
      if (key === 'weather') setPhoenixWeatherWindowVisible(nextVisible)
      else if (key === 'latest311') setPhoenixLatest311WindowVisible(nextVisible)
      else if (key === 'intervention') setPhoenixInterventionWindowVisible(nextVisible)
      else if (key === 'briefingRoom') setPhoenixBriefingRoomVisible(nextVisible)
    }

    const isVisible =
      (key === 'weather' && phoenixWeatherWindowVisible) ||
      (key === 'latest311' && phoenixLatest311WindowVisible) ||
      (key === 'intervention' && phoenixInterventionWindowVisible) ||
      (key === 'briefingRoom' && phoenixBriefingRoomVisible)

    if (isVisible) {
      setVisibleById(false)
      setRightWindowsOrder((prev) => (prev || []).filter((k) => k !== key))
      return
    }

    setVisibleById(true)
    setRightWindowsOrder((prev) => {
      const next = (prev || []).filter((k) => k !== key)
      next.push(key)
      return next
    })
  }

  // Bootstrap order if visibility changes outside the menu.
  useEffect(() => {
    setRightWindowsOrder((prev) => {
      const current = Array.isArray(prev) ? prev : []
      const visibleKeys = []
      if (phoenixWeatherWindowVisible) visibleKeys.push('weather')
      if (phoenixLatest311WindowVisible) visibleKeys.push('latest311')
      if (phoenixInterventionWindowVisible) visibleKeys.push('intervention')
      if (phoenixBriefingRoomVisible) visibleKeys.push('briefingRoom')

      // Preserve existing order for keys that are still visible, then append any new visible keys.
      const kept = current.filter((k) => visibleKeys.includes(k))
      const missing = visibleKeys.filter((k) => !kept.includes(k))
      return [...kept, ...missing]
    })
  }, [
    phoenixWeatherWindowVisible,
    phoenixLatest311WindowVisible,
    phoenixInterventionWindowVisible,
    phoenixBriefingRoomVisible,
  ])

  // Navigation state
  const [currentView, setCurrentView] = useState('map') // 'map' | 'performance' | 'work-orders' | 'risk' | 'economic' | 'capital'
  const [mapFocusRequest, setMapFocusRequest] = useState(null)
  const [mapPopupRequest, setMapPopupRequest] = useState(null)

  // Copilot / AI chat state
  const [activeTab, setActiveTab] = useState('chat')
  const [chatMessages, setChatMessages] = useState([])
  const [isAiResponding, setIsAiResponding] = useState(false)
  const [aiError, setAiError] = useState(null)

  // Success notifications
  const [successNotifications, setSuccessNotifications] = useState([])

  const addSuccessNotification = (message) => {
    const notification = { id: Date.now(), message, timestamp: new Date() }
    setSuccessNotifications(prev => [...prev, notification])
  }

  const removeSuccessNotification = (id) => {
    setSuccessNotifications(prev => prev.filter(n => n.id !== id))
  }

  // City selection ('stl' | 'baltimore' | 'howard' | 'phoenix')
  const [selectedCity, setSelectedCity] = useState('phoenix')

  // Map rendering (MapLibre-only)
  const [mapLibreColors, setMapLibreColors] = useState({
    pointColor: '#f97316',           // Orange for individual points
    clusterSmall: '#f97316',         // Orange for clusters <50
    clusterMedium: '#ef4444',        // Red for clusters 50-200
    clusterLarge: '#b91c1c',         // Dark red for clusters >200
  })

  // Date selection (full date for filtering 311 data and calculating 30-day metrics)
  const [selectedDate, setSelectedDate] = useState(() => new Date()) // Default to today
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [phoenixCallsForServiceMinDate, setPhoenixCallsForServiceMinDate] = useState(null) // Date
  const [phoenixCallsForServiceMaxDate, setPhoenixCallsForServiceMaxDate] = useState(null) // Date

  // Map layer visibility
  const [neighborhoodsRiskVisible, setNeighborhoodsRiskVisible] = useState(false)
  const [baltimoreNeighborhoodsData, setBaltimoreNeighborhoodsData] = useState(null) // Store fetched neighborhood GeoJSON
  const [baltimoreNeighborhoodsAffected, setBaltimoreNeighborhoodsAffected] = useState(true) // Show affected neighborhoods by default
  const [baltimoreNeighborhoodsAll, setBaltimoreNeighborhoodsAll] = useState(false) // Show all neighborhoods
  const [phoenixNeighborhoodBoundariesVisible, setPhoenixNeighborhoodBoundariesVisible] = useState(false)
  const [phoenixVillagesGeojson, setPhoenixVillagesGeojson] = useState(null)
  const [phoenixVillagesEnabled, setPhoenixVillagesEnabled] = useState({}) // { [NAME]: boolean }
  // Calls for Service: village choropleth (mutually exclusive with "Neighborhood boundaries" overlay)
  const [phoenixVillagesCfsRagVisible, setPhoenixVillagesCfsRagVisible] = useState(false)
  // Calls for Service: council district choropleth (mutually exclusive with other Phoenix boundary overlays)
  const [phoenixCouncilDistrictsCfsRagVisible, setPhoenixCouncilDistrictsCfsRagVisible] = useState(false)

  const [phoenixCouncilDistrictBoundariesVisible, setPhoenixCouncilDistrictBoundariesVisible] = useState(false)
  const [phoenixCouncilDistrictsGeojson, setPhoenixCouncilDistrictsGeojson] = useState(null)
  const [phoenixCouncilDistrictsEnabled, setPhoenixCouncilDistrictsEnabled] = useState({}) // { [DISTRICT]: boolean }

  // Calls for Service (Phoenix) — derived from CSV + geocoding
  const [callsForServiceVisible, setCallsForServiceVisible] = useState(true)
  const [callsForServiceStyle, setCallsForServiceStyle] = useState('default') // 'default' | 'cluster' | 'heatmap'
  const [callsForServiceTypes, setCallsForServiceTypes] = useState({}) // { [FINAL_CALL_TYPE]: boolean }
  const [callsForServiceBuckets, setCallsForServiceBuckets] = useState([]) // [{ bucketId, bucketName, total, types: [{typeName,count}] }]
  const [callsForServiceGeojson, setCallsForServiceGeojson] = useState(null)
  const [callsForServiceNeedsGeocode, setCallsForServiceNeedsGeocode] = useState(false)
  const [callsForServiceMissingGeocodeCount, setCallsForServiceMissingGeocodeCount] = useState(0)
  const [callsForServiceMeta, setCallsForServiceMeta] = useState({
    status: 'ready', // 'ready' | 'geocoding' | 'error'
    localHash: null,
    lastSyncedAt: null,
    message: null,
    geocode: { done: 0, total: 0 },
  })
  const [baltimore311Visible, setBaltimore311Visible] = useState(true) // Auto-show 311 data by default
  const [baltimore311Style, setBaltimore311Style] = useState('default') // 'default' | 'cluster' | 'heatmap'
  const [baltimore311Clustered, setBaltimore311Clustered] = useState(false)
  const [baltimore311HideClosed, setBaltimore311HideClosed] = useState(true) // Hide closed requests by default
  const [baltimore311Types, setBaltimore311Types] = useState({}) // { 'Potholes': true, 'Graffiti': false, ... }
  const [baltimore311Data, setBaltimore311Data] = useState(null) // Full GeoJSON for the selected year
  const [baltimore311DataYear, setBaltimore311DataYear] = useState(null) // Track which year this data represents
  
  // Health data (overdose & naloxone)
  const [healthOverdoseVisible, setHealthOverdoseVisible] = useState(false)
  const [healthNaloxoneVisible, setHealthNaloxoneVisible] = useState(false)
  const [healthOverdoseData, setHealthOverdoseData] = useState(null) // GeoJSON for selected year
  const [healthNaloxoneData, setHealthNaloxoneData] = useState(null) // GeoJSON for selected year
  const [healthOverdoseFilters, setHealthOverdoseFilters] = useState({}) // { 'substance:Fentanyl': true, ... }
  const [healthNaloxoneFilters, setHealthNaloxoneFilters] = useState({}) // { 'locationType:Pharmacy': true, ... }
  const [healthDataYear, setHealthDataYear] = useState(null) // Track which year this data represents

  // Phoenix: Heat & Homelessness (Homelessness services series from monthly CSV)
  const [phoenixHomelessnessVisible, setPhoenixHomelessnessVisible] = useState(false)
  const [phoenixHomelessnessRows, setPhoenixHomelessnessRows] = useState([])
  const [phoenixHomelessnessSnapshot, setPhoenixHomelessnessSnapshot] = useState(null)
  const [phoenixHomelessnessMeta, setPhoenixHomelessnessMeta] = useState({ status: 'ready', message: null })
  const [phoenixHomelessnessCategoryEnabled, setPhoenixHomelessnessCategoryEnabled] = useState({}) // { [CATEGORY]: boolean }
  const [phoenixHomelessnessAffectedNeighborhoodsVisible, setPhoenixHomelessnessAffectedNeighborhoodsVisible] = useState(false)
  const [phoenixTemperatureNeighborhoodsVisible, setPhoenixTemperatureNeighborhoodsVisible] = useState(false)
  const [phoenixTemperatureNeighborhoodsLabelsVisible, setPhoenixTemperatureNeighborhoodsLabelsVisible] = useState(false)
  const [phoenixHeatDeathsVisible, setPhoenixHeatDeathsVisible] = useState(false)
  const [phoenixHeatDeathsLabelsVisible, setPhoenixHeatDeathsLabelsVisible] = useState(false)

  const [phoenixHeatIllnessesVisible, setPhoenixHeatIllnessesVisible] = useState(false)
  const [phoenixCoolingCentersVisible, setPhoenixCoolingCentersVisible] = useState(false)
  const [phoenixHeatIllnessesEnabled, setPhoenixHeatIllnessesEnabled] = useState({}) // { [Heat_Illness]: boolean }
  // Time mode for the Heat Illnesses choropleth.
  // 'current' = follow the calendar (week or month around the selected date)
  // 'all_historical' = aggregate every historical row regardless of date
  const [phoenixHeatIllnessesTimeMode, setPhoenixHeatIllnessesTimeMode] = useState('current')
  // Granularity used while in the 'current' time mode.
  const [phoenixHeatIllnessesGranularity, setPhoenixHeatIllnessesGranularity] = useState('week') // 'week' | 'month'
  // Heat illnesses geometry: show choropleth over council districts or villages.
  const [phoenixHeatIllnessesGeoView, setPhoenixHeatIllnessesGeoView] = useState('districts') // 'districts' | 'villages'

  // Phoenix master map-layer selector — only one primary use-case at a time.
  // 'calls' | 'heat-homelessness' | null
  const [phoenixActiveMasterLayer, setPhoenixActiveMasterLayer] = useState('calls')

  // Enforce Phoenix primary-layer exclusivity. Switching the master layer turns
  // off any visibilities belonging to the *other* group; setting it to null
  // turns everything off.
  useEffect(() => {
    if (selectedCity !== 'phoenix') return
    if (phoenixActiveMasterLayer === 'calls') {
      setPhoenixHeatIllnessesVisible(false)
      setPhoenixCoolingCentersVisible(false)
      setPhoenixHeatDeathsVisible(false)
      setPhoenixHeatDeathsLabelsVisible(false)
      setPhoenixTemperatureNeighborhoodsVisible(false)
      setPhoenixTemperatureNeighborhoodsLabelsVisible(false)
      setPhoenixHomelessnessVisible(false)
      setPhoenixHomelessnessAffectedNeighborhoodsVisible(false)
      return
    }
    if (phoenixActiveMasterLayer === 'heat-homelessness') {
      setCallsForServiceVisible(false)
      setPhoenixVillagesCfsRagVisible(false)
      setPhoenixCouncilDistrictsCfsRagVisible(false)
      return
    }
    setCallsForServiceVisible(false)
    setPhoenixVillagesCfsRagVisible(false)
    setPhoenixCouncilDistrictsCfsRagVisible(false)
    setPhoenixHeatIllnessesVisible(false)
    setPhoenixCoolingCentersVisible(false)
    setPhoenixHeatDeathsVisible(false)
    setPhoenixHeatDeathsLabelsVisible(false)
    setPhoenixTemperatureNeighborhoodsVisible(false)
    setPhoenixTemperatureNeighborhoodsLabelsVisible(false)
    setPhoenixHomelessnessVisible(false)
    setPhoenixHomelessnessAffectedNeighborhoodsVisible(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoenixActiveMasterLayer, selectedCity])

  const loadPhoenixHomelessnessFromSeed = async () => {
    const res = await fetch(phoenixHomelessnessSeedUrl)
    if (!res.ok) throw new Error(`Phoenix homelessness CSV load failed (${res.status})`)
    return await res.text()
  }
  
  // Heatmap configuration
  const [heatmapConfig, setHeatmapConfig] = useState({
    weight: 1,
    intensityMin: 1,
    intensityMax: 3,
    radiusMin: 2,
    radiusMax: 20,
    opacity: 1,
  })

  // Intelligence tab
  const [intelligenceItems, setIntelligenceItems] = useState([])
  const [hasUnreadIntelligence, setHasUnreadIntelligence] = useState(false)

  // Action panel (Alerts, Forecasting, Permits)
  const [activeActionTab, setActiveActionTab] = useState(null) // 'alerts' | 'forecasting' | 'permits' | null
  const [actionTabAnchor, setActionTabAnchor] = useState(null) // viewport rect for active action button
  const [neighborhoodAlerts, setNeighborhoodAlerts] = useState(null) // Alert data grouped by severity
  
  // Forecasting data
  const [potholeForecasts, setPotholeForecasts] = useState(null) // Pothole forecast data

  // Work orders (imported/adapted from leakage prototype patterns)
  const [workOrders, setWorkOrders] = useState([])

  const addIntelligenceItem = (item) => {
    setIntelligenceItems(prev => [...prev, { ...item, id: Date.now(), timestamp: new Date() }])
    setHasUnreadIntelligence(true)
  }

  const clearIntelligenceNotification = () => setHasUnreadIntelligence(false)

  const createWorkOrder = (workOrderData) => {
    const uniqueSuffix = Math.random().toString(36).slice(2, 7).toUpperCase()
    const newWorkOrder = {
      id: `WO-${Date.now()}-${uniqueSuffix}`,
      status: 'New',
      priority: 'Medium',
      createdAt: new Date().toISOString(),
      ...workOrderData,
    }
    setWorkOrders((prev) => [newWorkOrder, ...prev])
    return newWorkOrder
  }

  const requestMapFocus = ({ lng, lat, zoom = 15 }) => {
    if (typeof lng !== 'number' || typeof lat !== 'number') return
    setMapFocusRequest({ lng, lat, zoom, timestamp: Date.now() })
  }

  const requestMapPopup = ({ lng, lat, properties }) => {
    if (typeof lng !== 'number' || typeof lat !== 'number') return
    setMapPopupRequest({ lng, lat, properties: properties || {}, timestamp: Date.now() })
  }

  // Panel toggles
  const toggleCopilot = () => setCopilotVisible(prev => !prev)
  const toggleLayers = () => setLayersVisible(prev => !prev)

  const loadCallsForServiceFromSeed = async () => {
    const res = await fetch(callsForServiceSeedUrl)
    if (!res.ok) throw new Error(`Seed CSV load failed (${res.status})`)
    return await res.text()
  }

  const parseCallReceivedDate = (raw) => {
    // Example: "01/01/2026 12:00:42 AM"
    const m = String(raw || '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s+/)
    if (!m) return null
    const mm = Number(m[1])
    const dd = Number(m[2])
    const yyyy = Number(m[3])
    if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yyyy)) return null
    const d = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0))
    if (Number.isNaN(d.getTime())) return null
    return d
  }

  const updateCallsForServiceDerivedData = async (csvText, { allowGeocode = false } = {}) => {
    const rows = parseCallsForServiceCsv(csvText)
    const localHash = await sha256Hex(csvText)
    setCallsForServiceBuckets(groupCallsByBucket(rows))

    // Phoenix date bounds from dataset
    let minDate = null
    let maxDate = null
    for (const r of rows) {
      const d = parseCallReceivedDate(r.callReceivedRaw)
      if (!d) continue
      if (!minDate || d.getTime() < minDate.getTime()) minDate = d
      if (!maxDate || d.getTime() > maxDate.getTime()) maxDate = d
    }
    if (maxDate) {
      if (minDate) setPhoenixCallsForServiceMinDate(minDate)
      setPhoenixCallsForServiceMaxDate(maxDate)
      // Do NOT clamp selectedDate based on Calls for Service.
      // The selected date should be controlled by the user and/or other domains
      // (e.g. Heat Illnesses forecast window), not by CFS ingest.
    }

    // Load existing geojson (if any) to show immediately
    const existingGeo = await idbGet(CALLS_FOR_SERVICE_GEOJSON_KEY)
    if (existingGeo?.features) setCallsForServiceGeojson(existingGeo)

    // Determine which call types exist and default them to ON if empty
    const uniqueTypes = [...new Set(rows.map(r => r.finalCallType).filter(Boolean))].sort()
    setCallsForServiceTypes(prev => {
      const keys = Object.keys(prev || {})
      // If we already have types but they're all OFF (common after refresh),
      // default everything to ON so the layer renders immediately.
      if (keys.length) {
        const anyOn = keys.some((k) => prev?.[k] === true)
        if (anyOn) return prev
      }
      const next = {}
      uniqueTypes.forEach(t => { next[t] = true })
      return next
    })

    // Determine missing geocodes (prefer repo-tracked geocodes, then IndexedDB cache)
    const addresses = [...new Set(rows.map(r => r.hundredBlockAddr).filter(Boolean))]
    // Only geocode truly missing addresses (cached geocodes should not be re-requested on refresh)
    const missing = []
    for (const addr of addresses) {
      const normalized = normalizeAddress(addr)
      const hardcoded = cfsGeocodes?.[normalized]
      if (hardcoded?.lat && hardcoded?.lng) continue
      const cached = await getCachedGeocodeByNormalized(addr)
      if (!cached) missing.push(addr)
    }
    setCallsForServiceMissingGeocodeCount(missing.length)
    setCallsForServiceNeedsGeocode(missing.length > 0)
    // Soft cap: avoid blowing through daily quota on first run
    const MAX_NEW_GEOCODES_PER_RUN = 1200
    const toGeocode = missing.slice(0, MAX_NEW_GEOCODES_PER_RUN)

    const cancelRef = { cancelled: false }
    const isCancelled = () => cancelRef.cancelled

    setCallsForServiceMeta(prev => ({
      ...prev,
      status: allowGeocode && toGeocode.length ? 'geocoding' : 'ready',
      localHash,
      lastSyncedAt: Date.now(),
      message: null,
      geocode: { done: 0, total: allowGeocode ? toGeocode.length : 0 },
    }))

    if (allowGeocode && toGeocode.length) {
      await geocodeQueue(toGeocode, {
        minDelayMs: 550,
        isCancelled,
        onProgress: ({ done, total }) => {
          setCallsForServiceMeta(prev => ({ ...prev, geocode: { done, total } }))
        },
      })
    }

    // Build address->coords map from cache (covers both newly geocoded + previously cached)
    const addressToCoords = new Map()
    for (const addr of addresses) {
      const normalized = normalizeAddress(addr)
      const hardcoded = cfsGeocodes?.[normalized]
      if (hardcoded && Number.isFinite(hardcoded.lat) && Number.isFinite(hardcoded.lng)) {
        addressToCoords.set(normalized, { normalized, lat: hardcoded.lat, lng: hardcoded.lng })
        continue
      }
      const cached = await getCachedGeocodeByNormalized(addr)
      if (cached?.normalized && Number.isFinite(cached.lat) && Number.isFinite(cached.lng)) {
        addressToCoords.set(cached.normalized, cached)
      }
    }

    const features = rows.map((row) => {
      const normalized = normalizeAddress(row.hundredBlockAddr)
      const hit = addressToCoords.get(normalized)
      const lng = hit?.lng
      const lat = hit?.lat
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          incidentNum: row.incidentNum,
          finalCallType: row.finalCallType,
          finalRadioCode: row.finalRadioCode,
          dispCode: row.dispCode,
          disposition: row.disposition,
          callReceived: row.callReceivedRaw,
          hundredBlockAddr: row.hundredBlockAddr,
          grid: row.grid,
        },
      }
    }).filter(Boolean)

    const geojson = { type: 'FeatureCollection', features }
    setCallsForServiceGeojson(geojson)

    await idbSet(CALLS_FOR_SERVICE_CACHE_KEY, csvText)
    await idbSet(CALLS_FOR_SERVICE_GEOJSON_KEY, geojson)
    await idbSet(CALLS_FOR_SERVICE_META_KEY, { localHash, lastSyncedAt: Date.now() })

    setCallsForServiceMeta(prev => ({
      ...prev,
      status: 'ready',
      localHash,
      lastSyncedAt: Date.now(),
      message: null,
    }))
  }

  const startCallsForServiceGeocoding = async () => {
    if (selectedCity !== 'phoenix') return
    try {
      const cached = await idbGet(CALLS_FOR_SERVICE_CACHE_KEY)
      const csvText = cached || await loadCallsForServiceFromSeed()
      await updateCallsForServiceDerivedData(csvText, { allowGeocode: true })
    } catch (e) {
      setCallsForServiceMeta(prev => ({ ...prev, status: 'error', message: String(e?.message || e) }))
    }
  }

  // Bootstrap Calls for Service from cache/seed (Phoenix only; no remote syncing)
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (selectedCity !== 'phoenix') return
      try {
        const cached = await idbGet(CALLS_FOR_SERVICE_CACHE_KEY)
        if (cancelled) return
        const csvText = cached || await loadCallsForServiceFromSeed()
        if (cancelled) return
        await updateCallsForServiceDerivedData(csvText, { allowGeocode: false })
      } catch (e) {
        if (cancelled) return
        setCallsForServiceMeta(prev => ({ ...prev, status: 'error', message: String(e?.message || e) }))
      }
    }

    run()
    return () => { cancelled = true }
  }, [selectedCity])

  // Bootstrap Phoenix villages (neighborhood boundary polygons)
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (selectedCity !== 'phoenix') return
      try {
        const res = await fetch(phoenixVillagesUrl)
        if (!res.ok) throw new Error(`Phoenix villages load failed (${res.status})`)
        const geojson = await res.json()
        if (cancelled) return
        setPhoenixVillagesGeojson(geojson)
        setPhoenixVillagesEnabled((prev) => {
          if (prev && Object.keys(prev).length) return prev
          const next = {}
          ;(geojson?.features || []).forEach((f) => {
            const name = f?.properties?.NAME
            if (name) next[name] = true
          })
          return next
        })
      } catch (e) {
        if (cancelled) return
        setPhoenixVillagesGeojson(null)
        setPhoenixVillagesEnabled({})
      }
    }

    run()
    return () => { cancelled = true }
  }, [selectedCity])

  // Bootstrap Phoenix council districts (boundary polygons)
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (selectedCity !== 'phoenix') return
      try {
        const res = await fetch(phoenixCouncilDistrictsUrl)
        if (!res.ok) throw new Error(`Phoenix council districts load failed (${res.status})`)
        const geojson = await res.json()
        if (cancelled) return
        setPhoenixCouncilDistrictsGeojson(geojson)
        setPhoenixCouncilDistrictsEnabled((prev) => {
          if (prev && Object.keys(prev).length) return prev
          const next = {}
          ;(geojson?.features || []).forEach((f) => {
            const d = String(f?.properties?.DISTRICT ?? '').trim()
            if (d) next[d] = true
          })
          return next
        })
      } catch (e) {
        if (cancelled) return
        setPhoenixCouncilDistrictsGeojson(null)
        setPhoenixCouncilDistrictsEnabled({})
      }
    }

    run()
    return () => { cancelled = true }
  }, [selectedCity])

  // Bootstrap Phoenix homelessness series from seed (Phoenix only)
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (selectedCity !== 'phoenix') return
      try {
        setPhoenixHomelessnessMeta({ status: 'loading', message: null })
        const csvText = await loadPhoenixHomelessnessFromSeed()
        if (cancelled) return
        const rows = parsePhoenixHomelessnessCsv(csvText)
        if (cancelled) return
        setPhoenixHomelessnessRows(rows)
        const snap = getPhoenixHomelessnessSnapshot(rows, selectedDate)
        setPhoenixHomelessnessSnapshot(snap)
        setPhoenixHomelessnessCategoryEnabled((prev) => {
          if (prev && Object.keys(prev).length) return prev
          const unique = [...new Set(rows.map(r => r.category).filter(Boolean))].sort()
          const next = {}
          unique.forEach((c) => { next[c] = true })
          return next
        })
        setPhoenixHomelessnessMeta({ status: 'ready', message: null })
      } catch (e) {
        if (cancelled) return
        setPhoenixHomelessnessRows([])
        setPhoenixHomelessnessSnapshot(null)
        setPhoenixHomelessnessCategoryEnabled({})
        setPhoenixHomelessnessMeta({ status: 'error', message: String(e?.message || e) })
      }
    }

    run()
    return () => { cancelled = true }
  }, [selectedCity])

  // Initialize synthetic heat illness toggles (Phoenix only; from bundled JSON)
  useEffect(() => {
    if (selectedCity !== 'phoenix') return
    setPhoenixHeatIllnessesEnabled((prev) => {
      if (prev && Object.keys(prev).length) return prev
      const rows = phoenixHeatIllnessesSyntheticDemo?.rows || []
      const unique = [...new Set(rows.map((r) => r?.Heat_Illness).filter(Boolean))].sort()
      const next = {}
      unique.forEach((k) => { next[k] = true })
      return next
    })
  }, [selectedCity])

  // Recompute homelessness snapshot when date changes
  useEffect(() => {
    if (selectedCity !== 'phoenix') return
    if (!phoenixHomelessnessRows?.length) return
    setPhoenixHomelessnessSnapshot(getPhoenixHomelessnessSnapshot(phoenixHomelessnessRows, selectedDate))
  }, [selectedDate, selectedCity, phoenixHomelessnessRows])

  // AI chat actions
  const clearChat = () => setChatMessages([])

  const deleteMessage = (messageId) => {
    setChatMessages(prev => prev.filter(msg => msg.id !== messageId))
  }

  const sendUserMessage = async (messageText) => {
    if (!messageText.trim()) return

    setAiError(null)

    const applyCopilotUiActions = (rawText) => {
      const text = String(rawText || '').trim().toLowerCase()
      const actions = []

      const wantsOn = /\b(show|enable|turn on|see|view|display)\b/.test(text)
      const wantsOff = /\b(hide|disable|turn off)\b/.test(text)
      const wantsToggle = /\b(toggle|switch)\b/.test(text) && !wantsOn && !wantsOff

      const desired = () => {
        if (wantsOn) return true
        if (wantsOff) return false
        return null
      }

      const setAllPhoenixVillages = (on) => {
        setPhoenixVillagesEnabled((prev) => {
          const names = Object.keys(prev || {})
          if (!names.length) return prev || {}
          const next = { ...prev }
          names.forEach((n) => { next[n] = !!on })
          return next
        })
      }

      if (selectedCity === 'phoenix') {
        // Neighborhood boundaries (master)
        if ((wantsOn || wantsOff || wantsToggle) && /\b(boundar|border|boundaries)\b/.test(text) && /\b(neighborhood|neighbourhood|neighborhoods|neighbourhoods|village|villages)\b/.test(text)) {
          const d = desired()
          if (d === true) {
            setPhoenixNeighborhoodBoundariesVisible(true)
            setPhoenixVillagesCfsRagVisible(false)
            setPhoenixCouncilDistrictsCfsRagVisible(false)
            setAllPhoenixVillages(true)
            actions.push('Turned on neighborhood boundaries.')
          } else if (d === false) {
            setPhoenixNeighborhoodBoundariesVisible(false)
            setAllPhoenixVillages(false)
            actions.push('Turned off neighborhood boundaries.')
          } else {
            setPhoenixNeighborhoodBoundariesVisible((v) => {
              const next = !v
              if (next) {
                setPhoenixVillagesCfsRagVisible(false)
                setPhoenixCouncilDistrictsCfsRagVisible(false)
              }
              return next
            })
            actions.push('Toggled neighborhood boundaries.')
          }
        }

        // Neighborhood boundaries (specific village)
        if ((wantsOn || wantsOff) && /\b(boundar|border|boundaries)\b/.test(text) && Object.keys(phoenixVillagesEnabled || {}).length) {
          const hit = Object.keys(phoenixVillagesEnabled || {}).find((n) => text.includes(String(n).toLowerCase()))
          if (hit) {
            setPhoenixNeighborhoodBoundariesVisible(true)
            setPhoenixVillagesCfsRagVisible(false)
            setPhoenixCouncilDistrictsCfsRagVisible(false)
            setPhoenixVillagesEnabled((prev) => ({ ...(prev || {}), [hit]: wantsOn }))
            actions.push(`${wantsOn ? 'Turned on' : 'Turned off'} ${hit} boundary.`)
          }
        }

        // Temperature overlay + labels
        if ((wantsOn || wantsOff || wantsToggle) && /\b(temperature|temp)\b/.test(text) && /\b(label|labels)\b/.test(text)) {
          const d = desired()
          if (d === true) { setPhoenixTemperatureNeighborhoodsLabelsVisible(true); actions.push('Turned on temperature labels.') }
          else if (d === false) { setPhoenixTemperatureNeighborhoodsLabelsVisible(false); actions.push('Turned off temperature labels.') }
          else { setPhoenixTemperatureNeighborhoodsLabelsVisible((v) => !v); actions.push('Toggled temperature labels.') }
        } else if ((wantsOn || wantsOff || wantsToggle) && /\b(temperature|temp)\b/.test(text)) {
          const d = desired()
          if (d === true) { setPhoenixTemperatureNeighborhoodsVisible(true); actions.push('Turned on the temperature neighborhood overlay.') }
          else if (d === false) { setPhoenixTemperatureNeighborhoodsVisible(false); actions.push('Turned off the temperature neighborhood overlay.') }
          else { setPhoenixTemperatureNeighborhoodsVisible((v) => !v); actions.push('Toggled the temperature neighborhood overlay.') }
        }

        // Heat deaths + labels
        if ((wantsOn || wantsOff || wantsToggle) && /\bheat deaths\b/.test(text) && /\b(label|labels)\b/.test(text)) {
          const d = desired()
          if (d === true) { setPhoenixHeatDeathsLabelsVisible(true); actions.push('Turned on heat deaths labels.') }
          else if (d === false) { setPhoenixHeatDeathsLabelsVisible(false); actions.push('Turned off heat deaths labels.') }
          else { setPhoenixHeatDeathsLabelsVisible((v) => !v); actions.push('Toggled heat deaths labels.') }
        } else if ((wantsOn || wantsOff || wantsToggle) && /\bheat deaths\b/.test(text)) {
          const d = desired()
          if (d === true) { setPhoenixHeatDeathsVisible(true); actions.push('Turned on heat deaths.') }
          else if (d === false) { setPhoenixHeatDeathsVisible(false); actions.push('Turned off heat deaths.') }
          else { setPhoenixHeatDeathsVisible((v) => !v); actions.push('Toggled heat deaths.') }
        }

        // Homelessness services + affected neighborhoods
        if ((wantsOn || wantsOff || wantsToggle) && /\baffected\b/.test(text) && /\b(neighborhood|neighbourhood|neighborhoods|neighbourhoods)\b/.test(text) && /\bhomeless\b/.test(text)) {
          const d = desired()
          if (d === true) { setPhoenixHomelessnessAffectedNeighborhoodsVisible(true); actions.push('Turned on homelessness affected neighborhoods.') }
          else if (d === false) { setPhoenixHomelessnessAffectedNeighborhoodsVisible(false); actions.push('Turned off homelessness affected neighborhoods.') }
          else { setPhoenixHomelessnessAffectedNeighborhoodsVisible((v) => !v); actions.push('Toggled homelessness affected neighborhoods.') }
        }

        // Homelessness service category toggles
        if ((wantsOn || wantsOff) && /\b(emergency shelter|rapid rehousing|street outreach)\b/.test(text)) {
          const cat =
            /\bemergency shelter\b/.test(text) ? 'Emergency Shelter'
              : /\bstreet outreach\b/.test(text) ? 'Street Outreach'
                : /\brapid rehousing\b/.test(text) ? 'Rapid Rehousing'
                  : null
          if (cat) {
            setPhoenixHomelessnessCategoryEnabled((prev) => ({ ...(prev || {}), [cat]: wantsOn }))
            actions.push(`${wantsOn ? 'Turned on' : 'Turned off'} ${cat}.`)
          }
        } else if ((wantsOn || wantsOff || wantsToggle) && /\bhomeless\b/.test(text)) {
          const d = desired()
          if (d === true) { setPhoenixHomelessnessVisible(true); actions.push('Turned on homelessness services.') }
          else if (d === false) { setPhoenixHomelessnessVisible(false); actions.push('Turned off homelessness services.') }
          else { setPhoenixHomelessnessVisible((v) => !v); actions.push('Toggled homelessness services.') }
        }

        // Calls for Service (visibility)
        if ((wantsOn || wantsOff || wantsToggle) && /\bcalls?\s+for\s+service\b/.test(text)) {
          const d = desired()
          if (d === true) { setCallsForServiceVisible(true); actions.push('Turned on Calls for Service.') }
          else if (d === false) {
            setCallsForServiceVisible(false)
            setPhoenixVillagesCfsRagVisible(false)
            setPhoenixCouncilDistrictsCfsRagVisible(false)
            actions.push('Turned off Calls for Service.')
          }
          else {
            setCallsForServiceVisible((v) => {
              const next = !v
              if (!next) {
                setPhoenixVillagesCfsRagVisible(false)
                setPhoenixCouncilDistrictsCfsRagVisible(false)
              }
              return next
            })
            actions.push('Toggled Calls for Service.')
          }
        }

        // Calls for Service view mode
        if ((wantsOn || wantsOff) && /\bcalls?\s+for\s+service\b/.test(text) && /\bcluster\b/.test(text)) {
          setCallsForServiceStyle(wantsOn ? 'cluster' : 'default')
          actions.push(`Set Calls for Service to ${wantsOn ? 'cluster' : 'default'} view.`)
        }
        if ((wantsOn || wantsOff) && /\bcalls?\s+for\s+service\b/.test(text) && /\bheatmap\b/.test(text)) {
          setCallsForServiceStyle(wantsOn ? 'heatmap' : 'default')
          actions.push(`Set Calls for Service to ${wantsOn ? 'heatmap' : 'default'} view.`)
        }
      }

      return actions
    }

    const userMessage = {
      id: Date.now(),
      type: 'user-message',
      message: messageText.trim(),
      timestamp: new Date(),
    }
    setChatMessages(prev => [...prev, userMessage])
    setIsAiResponding(true)

    try {
      const actions = applyCopilotUiActions(messageText.trim())
      if (actions.length) {
        const actionMessage = {
          id: Date.now() + 0.5,
          type: 'ai-message',
          message: actions.join(' '),
          timestamp: new Date(),
        }
        setChatMessages(prev => [...prev, actionMessage])
      }

      const maybeAnswerFromPhoenixMetrics = (rawText) => {
        if (selectedCity !== 'phoenix') return null
        const text = String(rawText || '').trim().toLowerCase()

        // Calls for Service "alarms" resolver (maps flexible phrasing → bucket/types)
        const asksCount =
          /\bhow many\b/.test(text) ||
          /\bcount\b/.test(text) ||
          /\bnumber of\b/.test(text) ||
          /\btotal\b/.test(text)

        const asksAlarms =
          /\balarm\b/.test(text) ||
          /\balarms\b/.test(text)

        if (asksCount && asksAlarms && Array.isArray(callsForServiceBuckets) && callsForServiceBuckets.length) {
          const alarmsBucket = callsForServiceBuckets.find((b) => b?.bucketId === 'alarms' || /alarm/i.test(String(b?.bucketName || '')))
          if (!alarmsBucket) return null

          const total = Number(alarmsBucket.total || 0)
          const top = (alarmsBucket.types || []).slice(0, 5)
          const lines = [
            `Calls for Service — Alarms: ${total.toLocaleString()} total.`,
          ]
          if (top.length) {
            lines.push('Top alarm-related call types:')
            top.forEach((t) => {
              lines.push(`- ${t.typeName}: ${Number(t.count || 0).toLocaleString()}`)
            })
          }
          return lines.join('\n')
        }

        // Neighborhood boundaries: list neighborhoods
        if ((/\b(list|show)\b/.test(text)) && (/\bneighborhoods?\b/.test(text) || /\bvillages?\b/.test(text)) && /\b(boundar|border|boundaries)\b/.test(text)) {
          const names = Object.keys(phoenixVillagesEnabled || {})
          if (names.length) {
            return `Phoenix neighborhoods (${names.length}): ` + names.slice().sort().join(', ')
          }
        }

        // Heat deaths: total or by neighborhood
        if ((/\bheat deaths?\b/.test(text)) && (/\bhow many\b/.test(text) || /\bcount\b/.test(text) || /\bnumber of\b/.test(text) || /\btotal\b/.test(text))) {
          const entries = Object.entries(phoenixHeatDeathsByVillage || {})
          if (entries.length) {
            const hit = entries.find(([name]) => text.includes(String(name).toLowerCase()))
            if (hit) {
              return `Heat deaths (example) — ${hit[0]}: ${Number(hit[1]).toLocaleString()}.`
            }
            const total = entries.reduce((sum, [, v]) => sum + (Number.isFinite(Number(v)) ? Number(v) : 0), 0)
            return `Heat deaths (example) — Phoenix neighborhoods total: ${total.toLocaleString()}.`
          }
        }

        // Homelessness services: total or by service category (as-of selected date snapshot)
        if ((/\bhomeless\b/.test(text) || /\bshelter\b/.test(text) || /\boutreach\b/.test(text) || /\brehousing\b/.test(text))
          && (/\bhow many\b/.test(text) || /\bcount\b/.test(text) || /\bnumber of\b/.test(text) || /\btotal\b/.test(text) || /\bserved\b/.test(text))) {
          const snap = phoenixHomelessnessSnapshot
          const cats = snap?.categories || []
          if (snap && Array.isArray(cats) && cats.length) {
            const normalized = (s) => String(s || '').toLowerCase()
            const wanted =
              /\bemergency shelter\b/.test(text) ? 'Emergency Shelter'
                : /\bstreet outreach\b/.test(text) ? 'Street Outreach'
                  : /\brapid rehousing\b/.test(text) ? 'Rapid Rehousing'
                    : null

            if (wanted) {
              const row = cats.find((c) => normalized(c.category) === normalized(wanted))
              if (row) {
                return `Homelessness services — ${wanted}: ${Number(row.value || 0).toLocaleString()} (${row.metric}) as of ${snap.periodLabel}.`
              }
            }

            // Total across categories for the latest period
            const total = cats.reduce((sum, c) => sum + (Number.isFinite(Number(c.value)) ? Number(c.value) : 0), 0)
            return `Homelessness services — total served (across categories): ${total.toLocaleString()} as of ${snap.periodLabel}.`
          }
        }

        return null
      }

      const metricAnswer = maybeAnswerFromPhoenixMetrics(messageText.trim())
      if (metricAnswer) {
        const aiMessage = {
          id: Date.now() + 1,
          type: 'ai-message',
          message: metricAnswer,
          timestamp: new Date(),
        }
        setChatMessages(prev => [...prev, aiMessage])
        return
      }

      const allMessages = [...chatMessages, userMessage]
      const aiResponse = await sendChatMessage(allMessages, {})

      const aiMessage = {
        id: Date.now() + 1,
        type: 'ai-message',
        message: aiResponse,
        timestamp: new Date(),
      }
      setChatMessages(prev => [...prev, aiMessage])
    } catch (error) {
      setAiError(error.message || 'Failed to get AI response. Please try again.')
    } finally {
      setIsAiResponding(false)
    }
  }

  const value = {
    // Panel visibility
    copilotVisible,
    setCopilotVisible,
    toggleCopilot,
    layersVisible,
    setLayersVisible,
    toggleLayers,
    // Floating windows (right side)
    phoenixWeatherWindowVisible,
    setPhoenixWeatherWindowVisible,
    phoenixLatest311WindowVisible,
    setPhoenixLatest311WindowVisible,
    phoenixInterventionWindowVisible,
    setPhoenixInterventionWindowVisible,
    phoenixBriefingRoomVisible,
    setPhoenixBriefingRoomVisible,
    kpiCardsVisible,
    setKpiCardsVisible,
    rightWindowsOrder,
    toggleRightWindow,
    rightWindowsCollapsed,
    toggleRightWindowCollapsed,
    // Navigation
    currentView,
    setCurrentView,
    mapFocusRequest,
    setMapFocusRequest,
    requestMapFocus,
    mapPopupRequest,
    setMapPopupRequest,
    requestMapPopup,

    // City
    selectedCity,
    setSelectedCity,

    // Date & Year
    selectedDate,
    setSelectedDate,
    selectedYear,
    setSelectedYear,
    phoenixCallsForServiceMinDate,
    phoenixCallsForServiceMaxDate,

    // Map layers
    neighborhoodsRiskVisible,
    setNeighborhoodsRiskVisible,
    baltimoreNeighborhoodsData,
    setBaltimoreNeighborhoodsData,
    baltimoreNeighborhoodsAffected,
    setBaltimoreNeighborhoodsAffected,
    baltimoreNeighborhoodsAll,
    setBaltimoreNeighborhoodsAll,
    phoenixNeighborhoodBoundariesVisible,
    setPhoenixNeighborhoodBoundariesVisible,
    phoenixVillagesGeojson,
    phoenixVillagesEnabled,
    setPhoenixVillagesEnabled,
    phoenixVillagesCfsRagVisible,
    setPhoenixVillagesCfsRagVisible,
    phoenixCouncilDistrictsCfsRagVisible,
    setPhoenixCouncilDistrictsCfsRagVisible,

    phoenixCouncilDistrictBoundariesVisible,
    setPhoenixCouncilDistrictBoundariesVisible,
    phoenixCouncilDistrictsGeojson,
    phoenixCouncilDistrictsEnabled,
    setPhoenixCouncilDistrictsEnabled,

    // Calls for Service
    callsForServiceVisible,
    setCallsForServiceVisible,
    callsForServiceStyle,
    setCallsForServiceStyle,
    callsForServiceTypes,
    setCallsForServiceTypes,
    callsForServiceBuckets,
    setCallsForServiceBuckets,
    callsForServiceGeojson,
    setCallsForServiceGeojson,
    callsForServiceNeedsGeocode,
    callsForServiceMissingGeocodeCount,
    callsForServiceMeta,
    setCallsForServiceMeta,
    startCallsForServiceGeocoding,
    baltimore311Visible,
    setBaltimore311Visible,
    baltimore311Style,
    setBaltimore311Style,
    baltimore311Clustered,
    setBaltimore311Clustered,
    baltimore311HideClosed,
    setBaltimore311HideClosed,
    baltimore311Types,
    setBaltimore311Types,
    baltimore311Data,
    setBaltimore311Data,
    baltimore311DataYear,
    setBaltimore311DataYear,
    
    mapLibreColors,
    setMapLibreColors,
    
    // Health data
    healthOverdoseVisible,
    setHealthOverdoseVisible,
    healthNaloxoneVisible,
    setHealthNaloxoneVisible,
    healthOverdoseData,
    setHealthOverdoseData,
    healthNaloxoneData,
    setHealthNaloxoneData,
    healthOverdoseFilters,
    setHealthOverdoseFilters,
    healthNaloxoneFilters,
    setHealthNaloxoneFilters,
    healthDataYear,
    setHealthDataYear,

    // Phoenix homelessness (Heat & Homelessness)
    phoenixHomelessnessVisible,
    setPhoenixHomelessnessVisible,
    phoenixHomelessnessSnapshot,
    phoenixHomelessnessMeta,
    phoenixHomelessnessCategoryEnabled,
    setPhoenixHomelessnessCategoryEnabled,
    phoenixHomelessnessAffectedNeighborhoodsVisible,
    setPhoenixHomelessnessAffectedNeighborhoodsVisible,
    phoenixTemperatureNeighborhoodsVisible,
    setPhoenixTemperatureNeighborhoodsVisible,
    phoenixTemperatureNeighborhoodsLabelsVisible,
    setPhoenixTemperatureNeighborhoodsLabelsVisible,
    phoenixHeatDeathsVisible,
    setPhoenixHeatDeathsVisible,
    phoenixHeatDeathsLabelsVisible,
    setPhoenixHeatDeathsLabelsVisible,

    phoenixHeatIllnessesVisible,
    setPhoenixHeatIllnessesVisible,
    phoenixCoolingCentersVisible,
    setPhoenixCoolingCentersVisible,
    phoenixHeatIllnessesEnabled,
    setPhoenixHeatIllnessesEnabled,
    phoenixHeatIllnessesTimeMode,
    setPhoenixHeatIllnessesTimeMode,
    phoenixHeatIllnessesGranularity,
    setPhoenixHeatIllnessesGranularity,
    phoenixHeatIllnessesGeoView,
    setPhoenixHeatIllnessesGeoView,

    // Phoenix master layer (mutually exclusive primary use-case)
    phoenixActiveMasterLayer,
    setPhoenixActiveMasterLayer,

    heatmapConfig,
    setHeatmapConfig,

    // AI chat
    activeTab,
    setActiveTab,
    chatMessages,
    setChatMessages,
    clearChat,
    deleteMessage,
    sendUserMessage,
    isAiResponding,
    setIsAiResponding,
    aiError,
    setAiError,

    // Intelligence
    intelligenceItems,
    addIntelligenceItem,
    hasUnreadIntelligence,
    clearIntelligenceNotification,

    // Action panel
    activeActionTab,
    setActiveActionTab,
    actionTabAnchor,
    setActionTabAnchor,
    neighborhoodAlerts,
    setNeighborhoodAlerts,
    
    // Forecasting
    potholeForecasts,
    setPotholeForecasts,

    // Work orders
    workOrders,
    setWorkOrders,
    createWorkOrder,

    // Notifications
    successNotifications,
    addSuccessNotification,
    removeSuccessNotification,
  }

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

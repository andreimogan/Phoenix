import maplibregl from 'maplibre-gl'
import { PHOENIX_SITUATIONAL_AWARENESS_FAKE } from '../data/phoenixSituationalAwarenessFakeData'
import {
  computeHeatTop2DistrictsNext16Days,
  formatHeatLabel,
} from './phoenixSituationalAwareness'

// ─── constants ────────────────────────────────────────────────────────────────

const SOURCE_KIND_CONFIG = [
  { kind: 'heat',     color: '#fb923c' },
  { kind: 'calls311', color: '#3b82f6' },
  { kind: 'housing',  color: '#a78bfa' },
  { kind: 'econ',     color: '#34d399' },
]

const KIND_META = {
  heat:     { accent: '#fb923c', title: 'Heat Forecast',         desc: 'Top district(s) for forecast heat-related illnesses over the next 16 days.' },
  calls311: { accent: '#3b82f6', title: '311 Service Requests',  desc: 'District with the most open 311 requests in the past 30 days.' },
  housing:  { accent: '#a78bfa', title: 'Housing Affordability', desc: 'District most affected by rent burden — highest share of cost-burdened households.' },
  econ:     { accent: '#34d399', title: 'Economic Activity',     desc: 'District leading small-business openings over the last 90 days.' },
}

const sourceId = (kind) => `phoenix-situational-${kind}`
const fillId   = (kind) => `phoenix-situational-${kind}-fill`
const lineId   = (kind) => `phoenix-situational-${kind}-line`
const labelId  = (kind) => `phoenix-situational-${kind}-label`

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

// ─── tooltip HTML ──────────────────────────────────────────────────────────────

/**
 * Compact always-visible card: district header + one pill per active sub-layer.
 */
function summaryHtml(districtId, entries) {
  const pills = entries.map(({ kind, label }) => {
    const { accent } = KIND_META[kind] || {}
    return `
      <div style="display:flex;align-items:center;gap:5px;margin-top:4px">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${accent};flex-shrink:0"></span>
        <span style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.85);white-space:nowrap">${label}</span>
      </div>
    `
  }).join('')

  return `
    <div style="padding:8px 11px;min-width:150px;max-width:220px;line-height:1.4">
      <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.50);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:1px">District ${districtId}</div>
      ${pills}
    </div>
  `
}

/**
 * Expanded on-hover card: full title + metric + description per sub-layer.
 */
function detailHtml(districtId, entries) {
  const rows = entries.map(({ kind, label }) => {
    const { accent, title, desc } = KIND_META[kind] || {}
    return `
      <div style="padding:6px 0;border-top:1px solid rgba(255,255,255,0.08)">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${accent};flex-shrink:0"></span>
          <span style="font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${accent}">${title}</span>
        </div>
        <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.95);margin-bottom:3px;line-height:1.2">${label}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.35">${desc}</div>
      </div>
    `
  }).join('')

  return `
    <div style="padding:10px 12px;min-width:210px;max-width:270px;line-height:1.4">
      <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.85);margin-bottom:1px">District ${districtId}</div>
      <div style="font-size:10px;font-weight:500;color:rgba(255,255,255,0.35);letter-spacing:0.03em;text-transform:uppercase;margin-bottom:2px">Situational Awareness</div>
      ${rows}
    </div>
  `
}

// ─── geometry helper ───────────────────────────────────────────────────────────

function featureCentroid(feature) {
  const coords = []
  const walk = (c) => {
    if (!c) return
    if (typeof c[0] === 'number' && typeof c[1] === 'number') { coords.push(c); return }
    if (Array.isArray(c)) c.forEach(walk)
  }
  walk(feature?.geometry?.coordinates)
  if (!coords.length) return null
  const lngs = coords.map((c) => c[0])
  const lats = coords.map((c) => c[1])
  return [
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
    (Math.min(...lats) + Math.max(...lats)) / 2,
  ]
}

// ─── static per-district popup placement ─────────────────────────────────────
// Manually spread tooltips so they don't overlap on the initial Phoenix view
// (bearing 20°, pitch 45°, center ~[-112.11, 33.50]).
// anchor = which edge/corner of the tooltip sits ON the lngLat point.
//   'bottom'     → tooltip body ABOVE  the point
//   'top'        → tooltip body BELOW  the point
//   'right'      → tooltip body LEFT   of the point
//   'left'       → tooltip body RIGHT  of the point
// offset = [x, y] pixel nudge applied after anchoring.
const DISTRICT_POPUP_PLACEMENT = {
  '3': { anchor: 'bottom',    offset: [0,   -10] }, // SE (Ahwatukee) — isolated, float above
  '5': { anchor: 'right',     offset: [-10,  20] }, // Central/Downtown — float to the right
  '7': { anchor: 'top-right', offset: [20,   12] }, // W-Central — float below-right, away from D8
  '8': { anchor: 'bottom-left', offset: [-15, -10] }, // West — float above-left, away from D7
}
const DEFAULT_PLACEMENT = { anchor: 'bottom', offset: [0, -10] }

// ─── per-map store ─────────────────────────────────────────────────────────────

const HOVER_SOURCE = 'phoenix-situational-hover'
const HOVER_FILL_LAYER = 'phoenix-situational-hover-fill'
const HOVER_LINE_LAYER = 'phoenix-situational-hover-line'

const _store = new WeakMap()
function getStore(map) {
  if (!_store.has(map)) _store.set(map, { popupsByDistrict: new Map(), hoveredDistrict: null, leaveTimer: null, listenersAdded: false, geojson: null })
  return _store.get(map)
}

function clearAllPopups(store) {
  for (const p of store.popupsByDistrict.values()) { try { p.popup.remove() } catch {} }
  store.popupsByDistrict.clear()
  store.hoveredDistrict = null
}

// ─── layer setup ──────────────────────────────────────────────────────────────

export function ensurePhoenixSituationalLayers(map) {
  if (!map) return

  // Hover highlight layers — single source shared across all kinds.
  if (!map.getSource(HOVER_SOURCE)) {
    map.addSource(HOVER_SOURCE, { type: 'geojson', data: EMPTY_FC })
  }
  if (!map.getLayer(HOVER_FILL_LAYER)) {
    map.addLayer({
      id: HOVER_FILL_LAYER,
      type: 'fill',
      source: HOVER_SOURCE,
      paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.08 },
      layout: { visibility: 'visible' },
    })
  }
  if (!map.getLayer(HOVER_LINE_LAYER)) {
    map.addLayer({
      id: HOVER_LINE_LAYER,
      type: 'line',
      source: HOVER_SOURCE,
      paint: {
        'line-color': '#ffffff',
        'line-width': 2.5,
        'line-opacity': 0.9,
      },
      layout: { visibility: 'visible' },
    })
  }

  for (const { kind, color } of SOURCE_KIND_CONFIG) {
    if (!map.getSource(sourceId(kind))) {
      map.addSource(sourceId(kind), { type: 'geojson', data: EMPTY_FC })
    }
    if (!map.getLayer(fillId(kind))) {
      map.addLayer({
        id: fillId(kind),
        type: 'fill',
        source: sourceId(kind),
        paint: { 'fill-color': color, 'fill-opacity': 0.18 },
        layout: { visibility: 'none' },
      })
    }
    if (!map.getLayer(lineId(kind))) {
      map.addLayer({
        id: lineId(kind),
        type: 'line',
        source: sourceId(kind),
        paint: { 'line-color': color, 'line-width': 2.4, 'line-opacity': 0.95 },
        layout: { visibility: 'none' },
      })
    }
    if (!map.getLayer(labelId(kind))) {
      map.addLayer({
        id: labelId(kind),
        type: 'symbol',
        source: sourceId(kind),
        layout: { visibility: 'none', 'text-field': ['get', 'label'] },
        paint: { 'text-color': '#ffffff' },
      })
    }
  }
}

// ─── hover listeners (registered once per map) ───────────────────────────────

function ensureHoverListeners(map) {
  const store = getStore(map)
  if (store.listenersAdded) return
  store.listenersAdded = true

  const setHoverHighlight = (districtId) => {
    const src = map.getSource(HOVER_SOURCE)
    if (!src) return
    if (!districtId || !store.geojson) {
      src.setData(EMPTY_FC)
      return
    }
    const feature = (store.geojson.features || []).find(
      (f) => String(f?.properties?.DISTRICT ?? '').trim() === districtId
    )
    src.setData(feature
      ? { type: 'FeatureCollection', features: [feature] }
      : EMPTY_FC
    )
  }

  const onMove = (e) => {
    const f = e.features?.[0]
    if (!f) return
    const districtId = String(f.properties?.DISTRICT ?? '').trim()
    const entry = store.popupsByDistrict.get(districtId)
    if (!entry) return

    clearTimeout(store.leaveTimer)
    map.getCanvas().style.cursor = 'pointer'

    if (store.hoveredDistrict && store.hoveredDistrict !== districtId) {
      const prev = store.popupsByDistrict.get(store.hoveredDistrict)
      if (prev) prev.popup.setHTML(summaryHtml(store.hoveredDistrict, prev.entries))
    }

    store.hoveredDistrict = districtId
    entry.popup.setHTML(detailHtml(districtId, entry.entries))
    setHoverHighlight(districtId)
  }

  const onLeave = () => {
    clearTimeout(store.leaveTimer)
    store.leaveTimer = setTimeout(() => {
      if (store.hoveredDistrict) {
        const entry = store.popupsByDistrict.get(store.hoveredDistrict)
        if (entry) entry.popup.setHTML(summaryHtml(store.hoveredDistrict, entry.entries))
      }
      store.hoveredDistrict = null
      map.getCanvas().style.cursor = ''
      setHoverHighlight(null)
    }, 80)
  }

  for (const { kind } of SOURCE_KIND_CONFIG) {
    map.on('mousemove', fillId(kind), onMove)
    map.on('mouseleave', fillId(kind), onLeave)
  }
}

// ─── apply (data + visibility + persistent tooltips) ──────────────────────────

export function applyPhoenixSituationalLayers(map, { geojson, selectedDate, flags }) {
  if (!map || !geojson) return
  const store = getStore(map)
  store.geojson = geojson

  const masterOn  = !!flags?.master
  const heatOn    = masterOn && !!flags?.heat
  const callsOn   = masterOn && !!flags?.calls311
  const housingOn = masterOn && !!flags?.housing
  const econOn    = masterOn && !!flags?.econ

  const heatTop  = heatOn ? computeHeatTop2DistrictsNext16Days(selectedDate) : []
  const heatById = new Map(heatTop.map((d) => [d.districtId, d]))

  const makeFC = (matcher) => {
    const features = []
    for (const f of geojson.features || []) {
      const id = String(f?.properties?.DISTRICT ?? '').trim()
      const meta = matcher(id)
      if (!meta) continue
      features.push({ ...f, properties: { ...(f.properties || {}), label: meta.label } })
    }
    return { type: 'FeatureCollection', features }
  }

  const heatFC    = heatOn    ? makeFC((id) => { const h = heatById.get(id); return h ? { label: formatHeatLabel(h.count) } : null }) : EMPTY_FC
  const callsFC   = callsOn   ? makeFC((id) => id === PHOENIX_SITUATIONAL_AWARENESS_FAKE.top311.districtId     ? { label: PHOENIX_SITUATIONAL_AWARENESS_FAKE.top311.label }     : null) : EMPTY_FC
  const housingFC = housingOn ? makeFC((id) => id === PHOENIX_SITUATIONAL_AWARENESS_FAKE.topHousing.districtId ? { label: PHOENIX_SITUATIONAL_AWARENESS_FAKE.topHousing.label } : null) : EMPTY_FC
  const econFC    = econOn    ? makeFC((id) => id === PHOENIX_SITUATIONAL_AWARENESS_FAKE.topEconBiz.districtId ? { label: PHOENIX_SITUATIONAL_AWARENESS_FAKE.topEconBiz.label } : null) : EMPTY_FC

  const kindMap = { heat: heatFC, calls311: callsFC, housing: housingFC, econ: econFC }
  const kindOn  = {
    heat:     heatOn    && heatFC.features.length > 0,
    calls311: callsOn   && callsFC.features.length > 0,
    housing:  housingOn && housingFC.features.length > 0,
    econ:     econOn    && econFC.features.length > 0,
  }

  for (const { kind } of SOURCE_KIND_CONFIG) {
    const src = map.getSource(sourceId(kind))
    if (src) src.setData(kindMap[kind])
    const v = kindOn[kind] ? 'visible' : 'none'
    if (map.getLayer(fillId(kind))) map.setLayoutProperty(fillId(kind), 'visibility', v)
    if (map.getLayer(lineId(kind))) map.setLayoutProperty(lineId(kind), 'visibility', v)
    if (map.getLayer(labelId(kind))) map.setLayoutProperty(labelId(kind), 'visibility', 'none')
  }

  // Rebuild district-grouped persistent popups
  clearAllPopups(store)
  // Clear hover highlight whenever layers are rebuilt
  const hoverSrc = map.getSource(HOVER_SOURCE)
  if (hoverSrc) hoverSrc.setData(EMPTY_FC)
  if (!masterOn) return

  // Aggregate: districtId → { feature, entries: [{ kind, label }] }
  const byDistrict = new Map()
  const addEntries = (kind, fc) => {
    if (!kindOn[kind]) return
    for (const f of fc.features) {
      const id = String(f.properties?.DISTRICT ?? '').trim()
      if (!byDistrict.has(id)) byDistrict.set(id, { feature: f, entries: [] })
      byDistrict.get(id).entries.push({ kind, label: String(f.properties?.label ?? '') })
    }
  }
  addEntries('heat',     heatFC)
  addEntries('calls311', callsFC)
  addEntries('housing',  housingFC)
  addEntries('econ',     econFC)

  for (const [districtId, { feature, entries }] of byDistrict) {
    const center = featureCentroid(feature)
    if (!center || !entries.length) continue

    const placement = DISTRICT_POPUP_PLACEMENT[districtId] || DEFAULT_PLACEMENT
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: '280px',
      className: 'popup-311',
      anchor: placement.anchor,
      offset: placement.offset,
    })
      .setLngLat(center)
      .setHTML(summaryHtml(districtId, entries))
      .addTo(map)

    store.popupsByDistrict.set(districtId, { popup, entries })
  }

  // Register hover listeners (idempotent — runs only once per map instance)
  ensureHoverListeners(map)
}

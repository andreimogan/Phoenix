const MS_DAY = 24 * 60 * 60 * 1000

function safeNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function ymdUtcMsFromLocalDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return Date.now()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const ms = Date.parse(`${y}-${m}-${dd}T00:00:00Z`)
  return Number.isFinite(ms) ? ms : Date.now()
}

function getGeojsonFeatureCenter(feature) {
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

function hashStringToUint32(str) {
  // Deterministic hash for stable sampling.
  let h = 2166136261
  const s = String(str || '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function makeRng(seedUint32) {
  // Deterministic LCG (good enough for jitter).
  let s = (seedUint32 >>> 0) || 1
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function pointInRing(lng, lat, ring) {
  // Ray casting; ring is [[lng,lat],...]
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0], yi = ring[i]?.[1]
    const xj = ring[j]?.[0], yj = ring[j]?.[1]
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi + 0.0) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygonRings(lng, lat, rings) {
  // rings: [outer, hole1, hole2, ...]
  if (!Array.isArray(rings) || !rings.length) return false
  const outer = rings[0]
  if (!Array.isArray(outer) || outer.length < 3) return false
  if (!pointInRing(lng, lat, outer)) return false
  for (let i = 1; i < rings.length; i++) {
    const hole = rings[i]
    if (Array.isArray(hole) && hole.length >= 3 && pointInRing(lng, lat, hole)) return false
  }
  return true
}

function pointInFeature(lng, lat, feature) {
  const g = feature?.geometry
  if (!g) return false
  if (g.type === 'Polygon') return pointInPolygonRings(lng, lat, g.coordinates)
  if (g.type === 'MultiPolygon') return (g.coordinates || []).some((poly) => pointInPolygonRings(lng, lat, poly))
  return false
}

function bboxFromFeatureGeometry(feature) {
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
  return [minX, minY, maxX, maxY]
}

function samplePointsInFeature(feature, count, seedKey) {
  const n = Math.max(1, Math.floor(Number(count) || 1))
  const box = bboxFromFeatureGeometry(feature)
  if (!box) return []
  const [minX, minY, maxX, maxY] = box
  const rng = makeRng(hashStringToUint32(seedKey))

  // Stratified jittered grid: stable + fills polygon area reasonably.
  const gridN = Math.max(2, Math.ceil(Math.sqrt(n)))
  const dx = (maxX - minX) / gridN
  const dy = (maxY - minY) / gridN
  const pts = []

  const maxPasses = 10
  for (let pass = 0; pass < maxPasses && pts.length < n; pass++) {
    for (let iy = 0; iy < gridN && pts.length < n; iy++) {
      for (let ix = 0; ix < gridN && pts.length < n; ix++) {
        const jx = (rng() - 0.5) * dx
        const jy = (rng() - 0.5) * dy
        const lng = minX + (ix + 0.5) * dx + jx
        const lat = minY + (iy + 0.5) * dy + jy
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
        if (pointInFeature(lng, lat, feature)) pts.push([lng, lat])
      }
    }
  }

  if (!pts.length) {
    const c = getGeojsonFeatureCenter(feature)
    return c ? [c] : []
  }

  return pts.slice(0, n)
}

export function computeHeatIllnessTotalsByDistrict({
  rows,
  selectedDate,
  enabledSet,
  timeMode = 'current',
  granularity = 'week', // 'week' | 'month'
} = {}) {
  const all = Array.isArray(rows) ? rows : []
  const enabled = enabledSet instanceof Set ? enabledSet : new Set()

  const filteredBase = all.filter((r) => {
    const illness = r?.Heat_Illness
    if (illness && enabled.size && !enabled.has(illness)) return false
    const dt = String(r?.Data_Type || '').trim()
    if (String(timeMode) === 'all_historical') return dt === 'HISTORICAL'
    // 'current' admits both HISTORICAL and FORECAST_2026; date filter below picks the matching window.
    return true
  })

  const selectedDayMs = ymdUtcMsFromLocalDate(selectedDate instanceof Date ? selectedDate : new Date())
  const selectedYearLocal = selectedDate instanceof Date ? selectedDate.getFullYear() : null
  const selectedMonthLocal = selectedDate instanceof Date ? (selectedDate.getMonth() + 1) : null

  const inSelectedWeek = (weekStartIso) => {
    const start = Date.parse(String(weekStartIso || '') + 'T00:00:00Z')
    if (!Number.isFinite(start)) return false
    return selectedDayMs >= start && selectedDayMs <= start + 6 * MS_DAY
  }

  const inSelectedMonth = (weekStartIso) => {
    if (!selectedYearLocal || !selectedMonthLocal) return false
    const m = String(weekStartIso || '').match(/^(\d{4})-(\d{2})-\d{2}$/)
    if (!m) return false
    return Number(m[1]) === selectedYearLocal && Number(m[2]) === selectedMonthLocal
  }

  const filteredRows = String(timeMode) === 'current'
    ? filteredBase.filter((r) => String(granularity) === 'month'
      ? inSelectedMonth(r?.Week_Start)
      : inSelectedWeek(r?.Week_Start))
    : filteredBase

  const totalsByDistrict = new Map() // district -> totalCount
  for (const r of filteredRows) {
    const d = String(r?.Council_District ?? '').trim()
    const c = safeNum(r?.Count) ?? 0
    if (!d || !Number.isFinite(c)) continue
    totalsByDistrict.set(d, (totalsByDistrict.get(d) || 0) + c)
  }

  const noData = filteredRows.length === 0
  const hasForecast = filteredRows.some((r) => String(r?.Data_Type || '').trim() === 'FORECAST_2026')
  const hasHistorical = filteredRows.some((r) => String(r?.Data_Type || '').trim() === 'HISTORICAL')
  const dataKind = noData ? 'none' : (hasForecast && hasHistorical ? 'mixed' : hasForecast ? 'forecast' : 'historical')

  return { totalsByDistrict, dataKind, rowCount: filteredRows.length }
}

export function buildSeedPointsFromDistrictTotals({ districtsGeojson, totalsByDistrict, samplesPerDistrict = 25 } = {}) {
  const base = districtsGeojson
  if (!base?.features?.length) return { type: 'FeatureCollection', features: [] }
  const totals = totalsByDistrict instanceof Map ? totalsByDistrict : new Map()

  const features = []
  for (const f of base.features || []) {
    const district = String(f?.properties?.DISTRICT ?? '').trim()
    if (!district) continue
    const total = Number(totals.get(district) || 0)
    if (!Number.isFinite(total) || total <= 0) continue
    const pts = samplePointsInFeature(f, samplesPerDistrict, `district:${district}`)
    if (!pts.length) continue
    const w = total / pts.length
    for (let i = 0; i < pts.length; i++) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: pts[i] },
        properties: { district, weight: w },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}

export function bboxFromGeojson(geojson) {
  const features = geojson?.features || []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const f of features) {
    const c = getGeojsonFeatureCenter(f)
    if (!c) continue
    minX = Math.min(minX, c[0]); minY = Math.min(minY, c[1])
    maxX = Math.max(maxX, c[0]); maxY = Math.max(maxY, c[1])
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null
  // Pad slightly so peaks can fall near edges
  const padX = (maxX - minX) * 0.08
  const padY = (maxY - minY) * 0.08
  return [minX - padX, minY - padY, maxX + padX, maxY + padY]
}

export function bboxFromGeojsonGeometry(geojson) {
  const features = geojson?.features || []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const f of features) {
    const box = bboxFromFeatureGeometry(f)
    if (!box) continue
    minX = Math.min(minX, box[0]); minY = Math.min(minY, box[1])
    maxX = Math.max(maxX, box[2]); maxY = Math.max(maxY, box[3])
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null
  const padX = (maxX - minX) * 0.05
  const padY = (maxY - minY) * 0.05
  return [minX - padX, minY - padY, maxX + padX, maxY + padY]
}

function approxKmBetween(lng1, lat1, lng2, lat2) {
  // Equirectangular approximation is fine at city scale.
  const x = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180))
  const y = (lat2 - lat1)
  const kmPerDeg = 111.32
  return Math.sqrt(x * x + y * y) * kmPerDeg
}

function scoreAt(lng, lat, seeds) {
  // Inverse-distance weighted sum with softening.
  let s = 0
  for (const f of seeds) {
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) continue
    const w = Number(f?.properties?.weight || 0)
    if (!Number.isFinite(w) || w <= 0) continue
    const dKm = approxKmBetween(lng, lat, c[0], c[1])
    const denom = (dKm * dKm) + 0.6 // soften so centroids don't dominate infinitely
    s += w / denom
  }
  return s
}

export function estimateCasesNearPeak({
  seedPoints,
  peakLngLat,
  radiusKm = 5,
} = {}) {
  const seeds = seedPoints?.features || []
  const c = Array.isArray(peakLngLat) && peakLngLat.length >= 2 ? peakLngLat : null
  const r = Number(radiusKm)
  if (!c || !Number.isFinite(r) || r <= 0 || !seeds.length) return null
  const [lng, lat] = c
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null

  let sum = 0
  for (const f of seeds) {
    const sc = f?.geometry?.coordinates
    if (!Array.isArray(sc) || sc.length < 2) continue
    const w = Number(f?.properties?.weight || 0)
    if (!Number.isFinite(w) || w <= 0) continue
    const dKm = approxKmBetween(lng, lat, sc[0], sc[1])
    if (!Number.isFinite(dKm) || dKm > r) continue
    // Taper so closer seeds contribute more, but preserve units in "cases".
    const t = Math.max(0, 1 - (dKm / r))
    sum += w * (0.35 + 0.65 * t)
  }

  return Number.isFinite(sum) ? sum : null
}

export function buildHotspotIsobandsGeojson({
  seedPoints,
  bbox,
  gridSize = 70, // medium
  bandFractions = [0.18, 0.35, 0.55, 0.75],
  insidePolygonFn,
} = {}) {
  const seeds = seedPoints?.features || []
  const box = Array.isArray(bbox) && bbox.length === 4 ? bbox : null
  const inside = typeof insidePolygonFn === 'function' ? insidePolygonFn : null
  if (!box || !seeds.length) return { type: 'FeatureCollection', features: [] }

  const [minX, minY, maxX, maxY] = box
  const n = Math.max(10, Math.min(220, Math.floor(gridSize)))
  const dx = (maxX - minX) / n
  const dy = (maxY - minY) / n

  // Sample intensity per cell center and track max.
  const cells = [] // { ix, iy, v }
  let vmax = 0
  for (let iy = 0; iy < n; iy++) {
    const cy = minY + (iy + 0.5) * dy
    for (let ix = 0; ix < n; ix++) {
      const cx = minX + (ix + 0.5) * dx
      if (inside && !inside(cx, cy)) continue
      const v = scoreAt(cx, cy, seeds)
      if (!Number.isFinite(v) || v <= 0) continue
      vmax = Math.max(vmax, v)
      cells.push({ ix, iy, v })
    }
  }
  if (!cells.length || vmax <= 0) return { type: 'FeatureCollection', features: [] }

  const fracs = Array.isArray(bandFractions) && bandFractions.length ? bandFractions : [0.18, 0.35, 0.55, 0.75]
  const thresholds = fracs
    .map((f) => Math.max(0, Math.min(1, Number(f))))
    .sort((a, b) => a - b)
    .map((f) => f * vmax)

  const bandIndexFor = (v) => {
    let band = -1
    for (let i = 0; i < thresholds.length; i++) {
      if (v >= thresholds[i]) band = i
    }
    return band
  }

  // Build filled “isoband” cells (area polygons). This renders as areas, not circular blobs.
  const features = []
  for (const c of cells) {
    const band = bandIndexFor(c.v)
    if (band < 0) continue
    const x0 = minX + c.ix * dx
    const y0 = minY + c.iy * dy
    const x1 = x0 + dx
    const y1 = y0 + dy
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ]],
      },
      properties: { band, value: c.v, valueMax: vmax },
    })
  }

  return { type: 'FeatureCollection', features }
}

export function findTop3HotspotPeaks({
  seedPoints,
  bbox,
  gridSize = 60,
  suppressKm = 6,
  insidePolygonFn,
} = {}) {
  const seeds = seedPoints?.features || []
  const box = Array.isArray(bbox) && bbox.length === 4 ? bbox : null
  if (!box || !seeds.length) return { peaks: [] }

  const [minX, minY, maxX, maxY] = box
  const peaks = []
  const suppressed = []

  const isSuppressed = (lng, lat) => suppressed.some((p) => approxKmBetween(lng, lat, p[0], p[1]) <= suppressKm)
  const inside = typeof insidePolygonFn === 'function' ? insidePolygonFn : null

  for (let pick = 0; pick < 3; pick++) {
    let best = null
    for (let iy = 0; iy < gridSize; iy++) {
      const lat = minY + (iy / (gridSize - 1)) * (maxY - minY)
      for (let ix = 0; ix < gridSize; ix++) {
        const lng = minX + (ix / (gridSize - 1)) * (maxX - minX)
        if (isSuppressed(lng, lat)) continue
        if (inside && !inside(lng, lat)) continue
        const sc = scoreAt(lng, lat, seeds)
        if (!best || sc > best.score) best = { lng, lat, score: sc }
      }
    }
    if (!best) break
    peaks.push({ ...best, rank: pick + 1 })
    suppressed.push([best.lng, best.lat])
  }

  return { peaks }
}


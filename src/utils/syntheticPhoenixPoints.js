// Deterministic synthetic point generator for Phoenix-only layers.
// Used when we have counts by program but no real geolocations.

const mulberry32 = (seed) => {
  let t = seed >>> 0
  return () => {
    t += 0x6D2B79F5
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const hashStringToSeed = (str) => {
  // FNV-1a 32-bit
  let h = 2166136261
  const s = String(str || '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const bboxFromFeatureCollection = (fc) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  const pushCoord = (lng, lat) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    minX = Math.min(minX, lng)
    minY = Math.min(minY, lat)
    maxX = Math.max(maxX, lng)
    maxY = Math.max(maxY, lat)
  }

  const walkCoords = (coords) => {
    if (!coords) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      pushCoord(coords[0], coords[1])
      return
    }
    for (const c of coords) walkCoords(c)
  }

  for (const f of fc?.features || []) {
    walkCoords(f?.geometry?.coordinates)
  }

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null
  return [minX, minY, maxX, maxY]
}

// Ray-casting point-in-polygon (ring: [[lng,lat],...])
const inRing = (pt, ring) => {
  const x = pt[0], y = pt[1]
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / Math.max(1e-12, (yj - yi)) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

const pointInPolygon = (pt, polygonCoords) => {
  // polygonCoords: [outerRing, hole1, hole2...]
  if (!polygonCoords?.length) return false
  const outer = polygonCoords[0]
  if (!inRing(pt, outer)) return false
  // If in any hole => outside
  for (let i = 1; i < polygonCoords.length; i++) {
    if (inRing(pt, polygonCoords[i])) return false
  }
  return true
}

const pointInFeatureCollection = (pt, fc) => {
  for (const f of fc?.features || []) {
    const g = f?.geometry
    if (!g) continue
    if (g.type === 'Polygon') {
      if (pointInPolygon(pt, g.coordinates)) return true
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates || []) {
        if (pointInPolygon(pt, poly)) return true
      }
    }
  }
  return false
}

const findContainingFeature = (pt, fc) => {
  const x = pt?.[0]
  const y = pt?.[1]
  for (const f of fc?.features || []) {
    const g = f?.geometry
    if (!g) continue
    // Fast bbox reject to avoid false positives on complex rings
    const bbox = f?.properties?._bbox
    if (bbox && x < bbox[0]) continue
    if (bbox && y < bbox[1]) continue
    if (bbox && x > bbox[2]) continue
    if (bbox && y > bbox[3]) continue
    if (g.type === 'Polygon') {
      if (pointInPolygon(pt, g.coordinates)) return f
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates || []) {
        if (pointInPolygon(pt, poly)) return f
      }
    }
  }
  return null
}

const ensureFeatureBboxes = (fc) => {
  const walk = (coords, push) => {
    if (!coords) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      push(coords[0], coords[1])
      return
    }
    for (const c of coords) walk(c, push)
  }

  for (const f of fc?.features || []) {
    if (f?.properties?._bbox) continue
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const push = (lng, lat) => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
      minX = Math.min(minX, lng)
      minY = Math.min(minY, lat)
      maxX = Math.max(maxX, lng)
      maxY = Math.max(maxY, lat)
    }
    walk(f?.geometry?.coordinates, push)
    if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
      f.properties = { ...(f.properties || {}), _bbox: [minX, minY, maxX, maxY] }
    }
  }
}

export function generateSyntheticPhoenixPoints({
  boundaryGeojson,
  seed,
  count,
  propertiesFactory,
  maxAttempts = 25000,
} = {}) {
  const fc = boundaryGeojson
  ensureFeatureBboxes(fc)
  const bbox = bboxFromFeatureCollection(fc)
  if (!bbox) return []

  const [minX, minY, maxX, maxY] = bbox
  const rand = mulberry32(hashStringToSeed(seed))

  const points = []
  let attempts = 0
  while (points.length < count && attempts < maxAttempts) {
    attempts++
    const lng = minX + rand() * (maxX - minX)
    const lat = minY + rand() * (maxY - minY)
    const pt = [lng, lat]
    const containing = findContainingFeature(pt, fc)
    if (!containing) continue

    const props = typeof propertiesFactory === 'function'
      ? propertiesFactory(points.length, { lng, lat, containingFeature: containing })
      : {}
    points.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: pt },
      properties: props || {},
    })
  }

  return points
}


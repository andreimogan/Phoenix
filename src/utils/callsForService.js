import Papa from 'papaparse'

export const CALLS_FOR_SERVICE_REMOTE_URL =
  'https://www.phoenixopendata.com/dataset/64a60154-3b2d-4583-8fb5-6d5e1b469c28/resource/ed707785-26b6-4949-9b04-5700b8a0125c/download/calls-for-service_2026-calls-for-service_callsforsrvc2026.csv'

export const CALLS_FOR_SERVICE_SEED_KEY = 'callsForService.seed.v1'
export const CALLS_FOR_SERVICE_CACHE_KEY = 'callsForService.cache.v1'
export const CALLS_FOR_SERVICE_GEOJSON_KEY = 'callsForService.geojson.v1'
export const CALLS_FOR_SERVICE_GEOCODE_KEY_PREFIX = 'callsForService.geocode.v1:'
export const CALLS_FOR_SERVICE_META_KEY = 'callsForService.meta.v1'

export function normalizeAddress(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*&\s*/g, ' & ')
    .toUpperCase()
}

export function parseCallsForServiceCsv(csvText) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  const rows = (parsed.data || []).map((r) => ({
    incidentNum: String(r.INCIDENT_NUM || '').trim(),
    dispCode: String(r.DISP_CODE || '').trim(),
    disposition: String(r.DISPOSITION || '').trim(),
    finalRadioCode: String(r.FINAL_RADIO_CODE || '').trim(),
    finalCallType: String(r.FINAL_CALL_TYPE || '').trim(),
    callReceivedRaw: String(r.CALL_RECEIVED || '').trim(),
    hundredBlockAddr: String(r.HUNDREDBLOCKADDR || '').trim(),
    grid: String(r.GRID || '').trim(),
  }))

  return rows.filter((r) => r.incidentNum && r.finalCallType && r.hundredBlockAddr)
}

function includesAny(hay, needles) {
  for (const n of needles) if (hay.includes(n)) return true
  return false
}

export function bucketCall(row) {
  const type = (row.finalCallType || '').toUpperCase()
  const radio = (row.finalRadioCode || '').toUpperCase()

  if (includesAny(type, ['SHOTS FIRED', 'SHOOTING', 'GUN', 'WEAPON'])) return 'weapons'
  if (includesAny(type, ['DOMESTIC'])) return 'domestic'
  if (includesAny(type, ['ASSAULT', 'FIGHT', 'ROBBERY'])) return 'violence'
  if (includesAny(type, ['BURGLARY', 'THEFT', 'CRIMINAL DAMAGE', 'VANDAL', 'SHOPLIFT'])) return 'property'
  if (includesAny(type, ['ALARM'])) return 'alarms'
  if (includesAny(type, ['HIT & RUN', 'ACCIDENT', 'TRAFFIC', 'ILLEGAL PARKING', 'DUI'])) return 'traffic'
  if (includesAny(type, ['CHECK WELFARE', 'WELFARE', 'INJURED', 'SICK', 'SUICID', 'MENTAL'])) return 'welfare'
  if (includesAny(type, ['TRESPASS'])) return 'trespass'
  if (includesAny(type, ['FIREWORK', 'NOISE', 'CROWD', 'DISTURB'])) return 'nuisance'

  // Heuristic fallback from radio code families
  if (radio.startsWith('41')) return 'violence'
  if (radio.startsWith('45')) return 'property'
  if (radio.startsWith('50')) return 'nuisance'
  if (radio.startsWith('90') || radio.startsWith('91')) return 'welfare'

  return 'other'
}

export const CALLS_BUCKET_DEFS = {
  weapons: { id: 'weapons', name: 'Weapons / Shots Fired' },
  domestic: { id: 'domestic', name: 'Domestic / Family' },
  violence: { id: 'violence', name: 'Violence / Assault' },
  property: { id: 'property', name: 'Property Crime' },
  alarms: { id: 'alarms', name: 'Alarms' },
  traffic: { id: 'traffic', name: 'Traffic / Collisions' },
  welfare: { id: 'welfare', name: 'Welfare / Medical' },
  trespass: { id: 'trespass', name: 'Trespassing' },
  nuisance: { id: 'nuisance', name: 'Nuisance / Crowd / Noise' },
  other: { id: 'other', name: 'Other' },
}

export function groupCallsByBucket(rows) {
  const buckets = {}
  for (const row of rows) {
    const bucketId = bucketCall(row)
    const type = row.finalCallType || 'Unknown'
    buckets[bucketId] ||= {}
    buckets[bucketId][type] ||= 0
    buckets[bucketId][type] += 1
  }

  // Convert to stable UI shape
  return Object.entries(buckets)
    .map(([bucketId, typeCounts]) => {
      const def = CALLS_BUCKET_DEFS[bucketId] || { id: bucketId, name: bucketId }
      const types = Object.entries(typeCounts)
        .map(([typeName, count]) => ({ typeName, count }))
        .sort((a, b) => b.count - a.count || a.typeName.localeCompare(b.typeName))
      const total = types.reduce((sum, t) => sum + t.count, 0)
      return { bucketId: def.id, bucketName: def.name, total, types }
    })
    .sort((a, b) => b.total - a.total || a.bucketName.localeCompare(b.bucketName))
}

export async function sha256Hex(text) {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}


import { idbGet, idbSet } from './idb'

const VERSION = 1
const PREFIX = `phoenix:district-temps:v${VERSION}:`

const keyForDistrict = (districtId) => `${PREFIX}${String(districtId || '').trim().toLowerCase()}`

export async function getPhoenixDistrictTempsCache(districtId) {
  const v = await idbGet(keyForDistrict(districtId))
  return v || null
}

export async function setPhoenixDistrictTempsCache(districtId, value) {
  return await idbSet(keyForDistrict(districtId), value)
}

export function isForecastStale(meta, maxAgeMs) {
  const fetchedAt = Number(meta?.fetchedAtMs)
  if (!Number.isFinite(fetchedAt)) return true
  return Date.now() - fetchedAt > maxAgeMs
}


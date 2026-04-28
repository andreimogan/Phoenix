import { idbGet, idbSet } from './idb'

const VERSION = 1
const PREFIX = `phoenix:temps:v${VERSION}:`

const keyForVillage = (villageName) => `${PREFIX}${String(villageName || '').toLowerCase()}`

export async function getPhoenixTempsCache(villageName) {
  const v = await idbGet(keyForVillage(villageName))
  return v || null
}

export async function setPhoenixTempsCache(villageName, value) {
  return await idbSet(keyForVillage(villageName), value)
}

export function isForecastStale(meta, maxAgeMs) {
  const fetchedAt = Number(meta?.fetchedAtMs)
  if (!Number.isFinite(fetchedAt)) return true
  return Date.now() - fetchedAt > maxAgeMs
}


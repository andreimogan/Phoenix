import { idbGet, idbSet } from './idb'
import {
  CALLS_FOR_SERVICE_GEOCODE_KEY_PREFIX,
  normalizeAddress,
} from './callsForService'

const LOCATIONIQ_TOKEN = 'pk.8f887dc88363746e9df3dae54ac7b9e4'
const LOCATIONIQ_ENDPOINT = 'https://us1.locationiq.com/v1/search'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function getCachedGeocodeByNormalized(normalizedAddress) {
  const normalized = normalizeAddress(normalizedAddress)
  if (!normalized) return null
  const cacheKey = `${CALLS_FOR_SERVICE_GEOCODE_KEY_PREFIX}${normalized}`
  const cached = await idbGet(cacheKey)
  if (cached?.lng && cached?.lat) return cached
  return null
}

export async function geocodePhoenixHundredBlock(hundredBlockAddr) {
  const normalized = normalizeAddress(hundredBlockAddr)
  if (!normalized) return null

  const cacheKey = `${CALLS_FOR_SERVICE_GEOCODE_KEY_PREFIX}${normalized}`
  const cached = await idbGet(cacheKey)
  if (cached?.lng && cached?.lat) return cached
  if (cached?.failedAt) return null

  // Bias by appending city/state; avoid leaking precise addresses (this is already a generalized hundred block)
  const q = `${hundredBlockAddr}, Phoenix, AZ`

  const params = new URLSearchParams({
    key: LOCATIONIQ_TOKEN,
    q,
    format: 'json',
    limit: '1',
    normalizecity: '1',
    countrycodes: 'us',
  })

  try {
    const res = await fetch(`${LOCATIONIQ_ENDPOINT}?${params.toString()}`)
    if (!res.ok) throw new Error(`LocationIQ ${res.status}`)
    const json = await res.json()
    const best = Array.isArray(json) ? json[0] : null
    const lat = best?.lat != null ? Number(best.lat) : null
    const lng = best?.lon != null ? Number(best.lon) : null
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      await idbSet(cacheKey, { normalized, failedAt: Date.now() })
      return null
    }
    const record = {
      normalized,
      lat,
      lng,
      fetchedAt: Date.now(),
      raw: {
        display_name: best?.display_name || '',
        importance: best?.importance ?? null,
        type: best?.type || '',
        class: best?.class || '',
      },
    }
    await idbSet(cacheKey, record)
    return record
  } catch (e) {
    await idbSet(cacheKey, { normalized, failedAt: Date.now(), error: String(e?.message || e) })
    return null
  }
}

/**
 * Rate-limited worker: LocationIQ free tier: 2 requests/sec.
 * This processes items sequentially with a minimum spacing.
 */
export async function geocodeQueue(items, {
  minDelayMs = 550,
  onProgress,
  isCancelled,
} = {}) {
  const results = []
  let done = 0
  const total = items.length

  for (const addr of items) {
    if (isCancelled?.()) break
    const started = Date.now()
    const r = await geocodePhoenixHundredBlock(addr)
    results.push(r)
    done += 1
    onProgress?.({ done, total, last: addr, lastResult: r })
    const elapsed = Date.now() - started
    const wait = Math.max(0, minDelayMs - elapsed)
    if (wait) await sleep(wait)
  }

  return results
}


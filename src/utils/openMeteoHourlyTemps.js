const OPEN_METEO_FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast'
const OPEN_METEO_ARCHIVE_BASE = 'https://archive-api.open-meteo.com/v1/archive'

// Simple global rate limiter for Open‑Meteo to avoid 429s when loading many villages/months.
// We serialize requests and enforce a minimum delay between them.
let _openMeteoQueue = Promise.resolve()
let _openMeteoLastTs = 0
// Open‑Meteo can be strict under bursty loads; keep this conservative.
const OPEN_METEO_MIN_INTERVAL_MS = 1000 // ~1 req/sec

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function rateLimitedFetch(url, init) {
  const run = async () => {
    const now = Date.now()
    const wait = Math.max(0, OPEN_METEO_MIN_INTERVAL_MS - (now - _openMeteoLastTs))
    if (wait) await sleep(wait)
    _openMeteoLastTs = Date.now()
    return await fetch(url, init)
  }

  _openMeteoQueue = _openMeteoQueue.then(run, run)
  return await _openMeteoQueue
}

async function fetchWithRetry(url, init) {
  let attempt = 0
  while (attempt < 5) {
    // eslint-disable-next-line no-await-in-loop
    const res = await rateLimitedFetch(url, init)
    if (res.status !== 429) return res
    attempt += 1
    // eslint-disable-next-line no-await-in-loop
    await sleep(1500 * attempt)
  }
  throw new Error('Open-Meteo rate limited (429)')
}

export const toYmd = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const monthKeyFromDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export const addMonths = (d, delta) => new Date(d.getFullYear(), d.getMonth() + delta, d.getDate())

export function buildMonthKeysAround(anchorDate, pastMonths, futureMonths) {
  const base = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  const out = []
  for (let i = -pastMonths; i <= futureMonths; i++) {
    out.push(monthKeyFromDate(new Date(base.getFullYear(), base.getMonth() + i, 1)))
  }
  return out
}

export function monthStartEndYmd(monthKey) {
  const [yStr, mStr] = String(monthKey || '').split('-')
  const y = Number(yStr)
  const m = Number(mStr) // 1-12
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 0)
  return { startYmd: toYmd(start), endYmd: toYmd(end) }
}

function normalizeHourly(json) {
  const times = json?.hourly?.time || []
  const temps = json?.hourly?.temperature_2m || []
  if (!Array.isArray(times) || !Array.isArray(temps) || times.length !== temps.length) return null
  return { times: times.map((t) => String(t)), tempsC: temps.map((v) => Number(v)) }
}

export async function fetchForecastHourlyTemps({ lng, lat, pastDays = 0, forecastDays = 16 }) {
  const url =
    `${OPEN_METEO_FORECAST_BASE}` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lng)}` +
    `&hourly=temperature_2m` +
    `&past_days=${encodeURIComponent(pastDays)}` +
    `&forecast_days=${encodeURIComponent(forecastDays)}` +
    `&timezone=auto`
  const res = await fetchWithRetry(url)
  if (!res.ok) throw new Error(`Open-Meteo forecast failed (${res.status})`)
  const json = await res.json()
  return normalizeHourly(json)
}

export async function fetchArchiveHourlyTemps({ lng, lat, startYmd, endYmd }) {
  const url =
    `${OPEN_METEO_ARCHIVE_BASE}` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lng)}` +
    `&start_date=${encodeURIComponent(startYmd)}` +
    `&end_date=${encodeURIComponent(endYmd)}` +
    `&hourly=temperature_2m` +
    `&timezone=auto`
  const res = await fetchWithRetry(url)
  if (!res.ok) throw new Error(`Open-Meteo archive failed (${res.status})`)
  const json = await res.json()
  return normalizeHourly(json)
}

export function mergeHourlySeries(seriesList) {
  const map = new Map() // time -> tempC
  for (const s of seriesList) {
    if (!s?.times?.length || !s?.tempsC?.length) continue
    for (let i = 0; i < s.times.length; i++) {
      const t = String(s.times[i] || '')
      const v = Number(s.tempsC[i])
      if (!t) continue
      if (!Number.isFinite(v)) continue
      map.set(t, v) // later series overwrite earlier
    }
  }
  const times = Array.from(map.keys()).sort()
  const tempsC = times.map((t) => map.get(t))
  return { times, tempsC }
}

export function buildSeasonalApproxFromLastYear({ baseSeries, targetTimes }) {
  // Seasonal approx: map target timestamp -> last year's same ISO local timestamp if present.
  // baseSeries should include at least the last year of hourly times.
  const lookup = new Map()
  if (baseSeries?.times?.length && baseSeries?.tempsC?.length) {
    for (let i = 0; i < baseSeries.times.length; i++) {
      const t = String(baseSeries.times[i] || '')
      const v = Number(baseSeries.tempsC[i])
      if (!t || !Number.isFinite(v)) continue
      lookup.set(t, v)
    }
  }

  const times = []
  const tempsC = []
  for (const t of targetTimes || []) {
    const s = String(t || '')
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
    if (!m) continue
    const y = Number(m[1])
    const lastYear = y - 1
    const lastKey = `${String(lastYear).padStart(4, '0')}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`
    const v = lookup.get(lastKey)
    if (!Number.isFinite(v)) continue
    times.push(s)
    tempsC.push(v)
  }
  return { times, tempsC }
}


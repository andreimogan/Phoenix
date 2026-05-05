const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

function ymdUtc(d) {
  const dt = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date()
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function clamp(n, lo, hi) {
  const x = Number(n)
  if (!Number.isFinite(x)) return lo
  return Math.max(lo, Math.min(hi, x))
}

function cToF(c) {
  const x = Number(c)
  if (!Number.isFinite(x)) return null
  return (x * 9) / 5 + 32
}

// Simple in-memory cache: key -> { atMs, value }
const dailyMaxCache = new Map()

async function fetchDailyMaxTempsC({ lat, lng, startDateUtc, days = 16, signal }) {
  const d0 = startDateUtc instanceof Date && !Number.isNaN(startDateUtc.getTime()) ? startDateUtc : new Date()
  const cacheKey = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}__${ymdUtc(d0)}__${days}`
  const cached = dailyMaxCache.get(cacheKey)
  if (cached && Date.now() - cached.atMs < 60 * 60 * 1000) return cached.value

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: 'temperature_2m_max',
    forecast_days: String(days),
    timezone: 'UTC',
  })

  const res = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, { signal })
  if (!res.ok) throw new Error(`Open-Meteo forecast failed (${res.status})`)
  const json = await res.json()
  const temps = json?.daily?.temperature_2m_max
  const times = json?.daily?.time
  if (!Array.isArray(temps) || !temps.length) return null

  const out = temps
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .slice(0, days)

  if (!out.length) return null
  const outTimes = Array.isArray(times) ? times.slice(0, out.length).map((s) => String(s || '').trim()).filter(Boolean) : []
  const value = { tempsC: out, timesIso: outTimes.length === out.length ? outTimes : null }
  dailyMaxCache.set(cacheKey, { atMs: Date.now(), value })
  return value
}

function isoUtcDay(d) {
  const dt = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date()
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function startOfLocalDay(d) {
  const dt = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date()
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0)
}

/**
 * Returns a per-day factor series for up to N forecast days (default 16).
 * The series starts at "today" (UTC from Open-Meteo), but we also provide a helper
 * to pick the factor corresponding to a local-calendar `selectedDate`.
 */
export async function getPhoenixDailyHeatDemandFactors({
  lat,
  lng,
  startDateUtc,
  days = 16,
  thresholdF = 95,
  slope = 0.015,
  maxDayFactor = 2.5,
  signal,
} = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null
  const series = await fetchDailyMaxTempsC({ lat: Number(lat), lng: Number(lng), startDateUtc, days, signal })
  if (!series?.tempsC?.length) return null
  const tempsF = series.tempsC.map(cToF).filter((v) => Number.isFinite(v)).slice(0, days)
  if (!tempsF.length) return null

  const startIso = isoUtcDay(startDateUtc instanceof Date ? startDateUtc : new Date())
  const dayIsos = Array.isArray(series.timesIso) && series.timesIso.length === tempsF.length
    ? series.timesIso
    : tempsF.map((_, i) => {
      const baseMs = Date.parse(startIso + 'T00:00:00Z')
      return Number.isFinite(baseMs) ? new Date(baseMs + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : startIso
    })

  const daysOut = tempsF.map((tMaxF, i) => {
    const tempDelta = Math.max(0, Number(tMaxF) - Number(thresholdF))
    const raw = 1 + Number(slope) * tempDelta
    const factor = clamp(raw, 1, Number(maxDayFactor))
    return {
      dayIso: dayIsos[i],
      tMaxF,
      factor,
    }
  })

  return {
    thresholdF,
    slope,
    days: daysOut,
  }
}

export function pickDailyFactorForSelectedDate(dailyFactors, selectedDate) {
  if (!dailyFactors?.days?.length) return null
  const sel = startOfLocalDay(selectedDate)
  if (Number.isNaN(sel.getTime())) return null
  // Compare by UTC day ISO (Open-Meteo daily.time is YYYY-MM-DD in UTC).
  const selIso = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}-${String(sel.getDate()).padStart(2, '0')}`
  return dailyFactors.days.find((d) => String(d.dayIso) === selIso) || null
}

/**
 * Compute a 16-day multiplier sum based on forecast max temperatures.
 * Returns null when forecast data is unavailable.
 */
export async function getPhoenix16DayHeatDemandMultiplier({
  lat,
  lng,
  startDateUtc,
  days = 16,
  thresholdF = 95,
  slope = 0.015,
  maxDayFactor = 2.5,
  signal,
} = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null

  const series = await fetchDailyMaxTempsC({ lat: Number(lat), lng: Number(lng), startDateUtc, days, signal })
  if (!series?.tempsC?.length) return null

  const tempsF = series.tempsC.map(cToF).filter((v) => Number.isFinite(v))
  if (!tempsF.length) return null

  const dayFactors = tempsF.slice(0, days).map((tMaxF) => {
    const tempDelta = Math.max(0, Number(tMaxF) - Number(thresholdF))
    const raw = 1 + Number(slope) * tempDelta
    return clamp(raw, 1, Number(maxDayFactor))
  })

  const sumFactor = dayFactors.reduce((a, b) => a + b, 0)
  return {
    days: dayFactors.length,
    sumFactor,
    tempsF,
    thresholdF,
    slope,
  }
}


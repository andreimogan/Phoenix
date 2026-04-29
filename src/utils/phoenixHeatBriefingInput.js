import * as XLSX from 'xlsx'

import heatReliefXlsxUrl from '../../External Datasets/Heat_Relief_Database_WithForecasting2.xlsx?url'

function safeNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseDateMaybe(v) {
  if (!v) return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

function ymd(d) {
  const dt = parseDateMaybe(d)
  if (!dt) return ''
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function rollingAvg(values) {
  const nums = (values || []).map(Number).filter((n) => Number.isFinite(n))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function pctChange(current, baseline) {
  const c = Number(current)
  const b = Number(baseline)
  if (!Number.isFinite(c) || !Number.isFinite(b) || b === 0) return null
  return ((c - b) / b) * 100
}

let workbookCache = null
let workbookCacheAt = 0

async function loadHeatReliefWorkbook() {
  const freshForMs = 30 * 60 * 1000
  if (workbookCache && Date.now() - workbookCacheAt < freshForMs) return workbookCache

  const res = await fetch(heatReliefXlsxUrl)
  if (!res.ok) throw new Error(`Heat relief dataset load failed (${res.status})`)
  const buf = await res.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  workbookCache = wb
  workbookCacheAt = Date.now()
  return wb
}

function sheetToObjects(wb, sheetName) {
  const ws = wb.Sheets?.[sheetName]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { raw: true, defval: null })
}

function pickCurrentWeek(weeklySummaryRows) {
  const today = new Date()
  const candidates = (weeklySummaryRows || [])
    .map((r) => {
      const ws = parseDateMaybe(r.Week_Start)
      const we = parseDateMaybe(r.Week_End)
      return { ...r, _ws: ws, _we: we }
    })
    .filter((r) => r._ws)

  if (!candidates.length) return null

  const onOrBefore = candidates.filter((r) => r._ws.getTime() <= today.getTime())
  const pool = onOrBefore.length ? onOrBefore : candidates
  return pool.reduce((best, r) => (!best || r._ws.getTime() > best._ws.getTime() ? r : best), null)
}

function inferAlertLevel({ maxTempF, deltaVsYesterdayC, emsDeltaVsBaselinePct }) {
  if (maxTempF == null) return null
  const t = Number(maxTempF)
  const d = Number(deltaVsYesterdayC)
  const ems = Number(emsDeltaVsBaselinePct)

  // Deterministic rule-based mapping (no invented numbers beyond thresholds):
  // Use temperature as primary, then bump if conditions worsened or EMS strain.
  let level = 'moderate'
  if (t >= 115) level = 'extreme'
  else if (t >= 110) level = 'severe'
  else if (t >= 105) level = 'elevated'
  else if (t >= 98) level = 'moderate'
  else level = 'low'

  if (Number.isFinite(d) && d > 2 && (level === 'moderate' || level === 'elevated')) level = 'severe'
  if (Number.isFinite(ems) && ems > 40) level = level === 'extreme' ? 'extreme' : 'severe'
  return level
}

function inferIllnessRisk({ heatIllnessesThisWeek, heatIllnessesDeltaPct, emsDeltaVsBaselinePct }) {
  // If we don't have illness counts, fall back to EMS deltas only.
  const ill = Number(heatIllnessesThisWeek)
  const illPct = Number(heatIllnessesDeltaPct)
  const ems = Number(emsDeltaVsBaselinePct)

  if (Number.isFinite(ill) && ill >= 250) return 'very_high'
  if (Number.isFinite(ill) && ill >= 150) return 'high'
  if (Number.isFinite(illPct) && illPct > 35) return 'high'
  if (Number.isFinite(ems) && ems > 35) return 'high'
  if (Number.isFinite(ems) && ems > 15) return 'moderate'
  return 'low'
}

async function fetchPhoenixPeakTimingAndDeltaC() {
  const params = new URLSearchParams({
    latitude: String(33.4484),
    longitude: String(-112.074),
    hourly: ['temperature_2m'].join(','),
    temperature_unit: 'fahrenheit',
    past_days: '2',
    forecast_days: '2',
    timezone: 'auto',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`)
  const json = await res.json()
  const time = json?.hourly?.time || []
  const tempF = json?.hourly?.temperature_2m || []
  const rows = time.map((t, i) => ({ t, tempF: safeNum(tempF[i]) })).filter((r) => r.t && r.tempF != null)

  const todayKey = ymd(new Date())
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yKey = ymd(y)

  const todays = rows.filter((r) => String(r.t).startsWith(todayKey))
  const yest = rows.filter((r) => String(r.t).startsWith(yKey))

  const peakToday = todays.reduce((best, r) => (!best || r.tempF > best.tempF ? r : best), null)
  const peakY = yest.reduce((best, r) => (!best || r.tempF > best.tempF ? r : best), null)

  const peakTime = peakToday?.t ? new Date(peakToday.t) : null
  const peakHour = peakTime ? peakTime.getHours() : null
  const startH = peakHour != null ? Math.max(0, peakHour - 2) : null
  const endH = peakHour != null ? Math.min(23, peakHour + 2) : null
  const peakTimingLocal = startH != null && endH != null
    ? `${String(startH).padStart(2, '0')}:00–${String(endH).padStart(2, '0')}:00`
    : null

  const deltaF = peakToday?.tempF != null && peakY?.tempF != null ? (peakToday.tempF - peakY.tempF) : null
  const deltaC = deltaF != null ? (deltaF - 32) * (5 / 9) - ((0) /* cancels */) : null
  // Simpler: ΔC = ΔF * 5/9
  const deltaVsYesterdayC = deltaF != null ? (deltaF * 5) / 9 : null

  return {
    peakTimingLocal: peakTimingLocal || null,
    deltaVsYesterdayC,
    maxTempF: peakToday?.tempF ?? null,
  }
}

export async function buildPhoenixHeatBriefingInput() {
  const [wb, wx] = await Promise.all([loadHeatReliefWorkbook(), fetchPhoenixPeakTimingAndDeltaC()])

  const weekly = sheetToObjects(wb, 'Weekly_Summary')
  const weekRow = pickCurrentWeek(weekly)
  const coolingRows = sheetToObjects(wb, 'Cooling_Center_Visits')

  if (!weekRow) {
    return {
      briefingDateISO: new Date().toISOString(),
      peakTimingLocal: wx?.peakTimingLocal || undefined,
      deltaVsYesterdayC: Number.isFinite(wx?.deltaVsYesterdayC) ? wx.deltaVsYesterdayC : undefined,
    }
  }

  const weekStartKey = ymd(weekRow.Week_Start)
  const year = safeNum(weekRow.Year) ?? (parseDateMaybe(weekRow.Week_Start)?.getFullYear() ?? null)

  // EMS proxy: Heat_Related_Calls vs prior 7 weeks avg
  const sortedWeekly = weekly
    .map((r) => ({ ...r, _ws: parseDateMaybe(r.Week_Start) }))
    .filter((r) => r._ws && (year == null || safeNum(r.Year) === year))
    .sort((a, b) => a._ws.getTime() - b._ws.getTime())
  const idx = sortedWeekly.findIndex((r) => ymd(r.Week_Start) === weekStartKey)
  const prev7 = idx > 0 ? sortedWeekly.slice(Math.max(0, idx - 7), idx) : []
  const callsThisWeek = safeNum(weekRow.Heat_Related_Calls)
  const callsAvg7 = rollingAvg(prev7.map((r) => r.Heat_Related_Calls))
  const emsDeltaVsBaselinePct = pctChange(callsThisWeek, callsAvg7)

  // Heat illness counts (if present in Weekly_Summary)
  // If not present, we keep undefined and let generator omit.
  const heatIllnessesThisWeek = safeNum(weekRow.Total_Visits) // best available proxy in weekly summary dataset
  const heatDeathsThisWeek = safeNum(weekRow.Heat_Deaths) // may be missing; will null out

  const prev6 = idx > 0 ? sortedWeekly.slice(Math.max(0, idx - 6), idx) : []
  const illAvg6 = rollingAvg(prev6.map((r) => r.Total_Visits))
  const heatIllnessesDeltaPct = pctChange(heatIllnessesThisWeek, illAvg6)

  // Cooling visits and top districts from Cooling_Center_Visits
  const weekCooling = coolingRows.filter((r) => ymd(r.Week_Start) === weekStartKey && (year == null || safeNum(r.Year) === year))
  const coolingVisitsThisWeek = weekCooling.reduce((sum, r) => sum + (safeNum(r.Visit_Count) ?? 0), 0)
  const coolingCentersOpenCount = new Set(weekCooling.map((r) => String(r.Cooling_Center || '').trim()).filter(Boolean)).size
  const byDistrict = new Map()
  for (const r of weekCooling) {
    const d = String(r.Council_District || '').trim()
    const v = safeNum(r.Visit_Count) ?? 0
    if (!d) continue
    byDistrict.set(d, (byDistrict.get(d) || 0) + v)
  }
  const topDistricts = [...byDistrict.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d)

  const alertLevel = inferAlertLevel({
    maxTempF: wx?.maxTempF ?? null,
    deltaVsYesterdayC: wx?.deltaVsYesterdayC ?? null,
    emsDeltaVsBaselinePct: emsDeltaVsBaselinePct ?? null,
  })
  const predictedHeatIllnessRisk = inferIllnessRisk({
    heatIllnessesThisWeek,
    heatIllnessesDeltaPct,
    emsDeltaVsBaselinePct,
  })

  return {
    briefingDateISO: new Date().toISOString(),
    alertLevel: alertLevel || undefined,
    peakTimingLocal: wx?.peakTimingLocal || undefined,
    deltaVsYesterdayC: Number.isFinite(wx?.deltaVsYesterdayC) ? wx.deltaVsYesterdayC : undefined,
    predictedHeatIllnessRisk: predictedHeatIllnessRisk || undefined,
    heatIllnessesThisWeek: heatIllnessesThisWeek ?? undefined,
    heatDeathsThisWeek: heatDeathsThisWeek ?? undefined,
    coolingVisitsThisWeek: Number.isFinite(coolingVisitsThisWeek) ? coolingVisitsThisWeek : undefined,
    coolingCentersOpenCount: Number.isFinite(coolingCentersOpenCount) ? coolingCentersOpenCount : undefined,
    highestRiskDistricts: topDistricts.length ? topDistricts : undefined,
    hottestDistricts: topDistricts.length ? topDistricts : undefined,
    emsDeltaVsBaselinePct: Number.isFinite(emsDeltaVsBaselinePct) ? emsDeltaVsBaselinePct : undefined,
  }
}


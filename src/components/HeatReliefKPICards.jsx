import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardHeader, CardTitle } from './ui/card'
import { usePanelContext } from '../contexts/PanelContext'
import * as XLSX from 'xlsx'

import heatReliefXlsxUrl from '../../External Datasets/Heat_Relief_Database_WithForecasting2.xlsx?url'

const badgeStyles = {
  red: {
    bg: 'rgba(220, 38, 38, 0.15)',
    border: 'rgba(220, 38, 38, 0.5)',
    text: '#fca5a5',
  },
  yellow: {
    bg: 'rgba(202, 138, 4, 0.15)',
    border: 'rgba(202, 138, 4, 0.5)',
    text: '#fde047',
  },
  green: {
    bg: 'rgba(127, 190, 72, 0.15)',
    border: 'rgba(127, 190, 72, 0.5)',
    text: '#86efac',
  },
  blue: {
    bg: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.45)',
    text: '#93c5fd',
  },
}

function Badge({ label, variant }) {
  const s = badgeStyles[variant] || badgeStyles.blue
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-[6px] text-[12px] font-medium leading-4 tracking-[-0.09px] whitespace-nowrap border"
      style={{ background: s.bg, borderColor: s.border, color: s.text }}
    >
      {label}
    </span>
  )
}

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

function fmtWeekLabel(weekStart, weekEnd) {
  const s = parseDateMaybe(weekStart)
  const e = parseDateMaybe(weekEnd)
  if (!s || !e) return 'This week'
  const sTxt = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const eTxt = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `Week ${sTxt}–${eTxt}`
}

// ---------- Heat Index (live) ----------
function heatIndexF(tempF, rh) {
  const T = Number(tempF)
  const R = Number(rh)
  if (!Number.isFinite(T) || !Number.isFinite(R)) return null
  // NOAA guidance: HI approx equals T when < 80F.
  if (T < 80) return T
  // Rothfusz regression
  const HI =
    -42.379 +
    2.04901523 * T +
    10.14333127 * R +
    -0.22475541 * T * R +
    -0.00683783 * T * T +
    -0.05481717 * R * R +
    0.00122874 * T * T * R +
    0.00085282 * T * R * R +
    -0.00000199 * T * T * R * R
  return HI
}

function heatIndexChip(hiF) {
  const hi = Number(hiF)
  if (!Number.isFinite(hi)) return { label: 'No data', variant: 'yellow', action: 'Check sensor feed' }
  if (hi >= 125) return { label: 'Extreme', variant: 'red', action: 'Activate Level 3 heat response' }
  if (hi >= 103) return { label: 'Danger', variant: 'red', action: 'Activate Level 2 heat response' }
  if (hi >= 90) return { label: 'Extreme caution', variant: 'yellow', action: 'Increase hydration + outreach messaging' }
  if (hi >= 80) return { label: 'Caution', variant: 'yellow', action: 'Increase hydration + outreach messaging' }
  return { label: 'Normal', variant: 'green', action: 'Maintain routine monitoring' }
}

async function fetchPhoenixHeatIndexHourly({ pastDays = 2, forecastDays = 1 } = {}) {
  const params = new URLSearchParams({
    latitude: String(33.4484),
    longitude: String(-112.074),
    hourly: ['temperature_2m', 'relative_humidity_2m'].join(','),
    temperature_unit: 'fahrenheit',
    past_days: String(pastDays),
    forecast_days: String(forecastDays),
    timezone: 'auto',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
  if (!res.ok) throw new Error(`Heat index request failed (${res.status})`)
  const json = await res.json()
  const time = json?.hourly?.time || []
  const tempF = json?.hourly?.temperature_2m || []
  const rh = json?.hourly?.relative_humidity_2m || []
  const out = []
  for (let i = 0; i < time.length; i++) {
    out.push({
      time: time[i],
      tempF: safeNum(tempF[i]),
      rh: safeNum(rh[i]),
    })
  }
  return out
}

function computeHeatIndexCard(rows) {
  const nowMs = Date.now()
  const parsed = (rows || []).map((r) => {
    const ms = new Date(r.time).getTime()
    const hi = heatIndexF(r.tempF, r.rh)
    return { ...r, ms, hiF: Number.isFinite(hi) ? hi : null }
  }).filter((r) => Number.isFinite(r.ms))

  if (!parsed.length) return null

  // current = first hour >= now
  const current = parsed.find((r) => r.ms >= nowMs) || parsed[parsed.length - 1]
  const currentHi = Number.isFinite(current?.hiF) ? current.hiF : null

  const todayKey = ymd(new Date())
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yKey = ymd(yesterday)

  const todays = parsed.filter((r) => String(r.time || '').startsWith(todayKey))
  const yest = parsed.filter((r) => String(r.time || '').startsWith(yKey))

  const peakToday = todays.reduce((best, r) => (Number.isFinite(r.hiF) && (!best || r.hiF > best.hiF) ? r : best), null)
  const peakY = yest.reduce((best, r) => (Number.isFinite(r.hiF) && (!best || r.hiF > best.hiF) ? r : best), null)

  const peakTime = peakToday?.time ? new Date(peakToday.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null
  const delta = (Number.isFinite(peakToday?.hiF) && Number.isFinite(peakY?.hiF)) ? Math.round(peakToday.hiF - peakY.hiF) : null

  const chip = heatIndexChip(Number.isFinite(currentHi) ? currentHi : peakToday?.hiF)

  return {
    title: 'Heat Index',
    metric: Number.isFinite(currentHi) ? String(Math.round(currentHi)) : '—',
    metricSuffix: '°F',
    description: `${peakTime ? `Peak at ${peakTime}` : 'Peak today'}${delta != null ? ` · ${delta >= 0 ? '+' : ''}${delta}°F vs yesterday` : ''}`,
    badge: { label: chip.label, variant: chip.variant },
    action: chip.action,
    details: [
      { label: 'Current heat index', value: Number.isFinite(currentHi) ? `${Math.round(currentHi)}°F` : '—' },
      { label: 'Today peak', value: Number.isFinite(peakToday?.hiF) ? `${Math.round(peakToday.hiF)}°F${peakTime ? ` at ${peakTime}` : ''}` : '—' },
      { label: 'Δ vs yesterday peak', value: delta != null ? `${delta >= 0 ? '+' : ''}${delta}°F` : '—' },
    ],
  }
}

// ---------- Heat relief workbook (weekly) ----------
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

function rollingAvg(values) {
  const nums = values.map(Number).filter((n) => Number.isFinite(n))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function pctChange(current, baseline) {
  const c = Number(current)
  const b = Number(baseline)
  if (!Number.isFinite(c) || !Number.isFinite(b) || b === 0) return null
  return ((c - b) / b) * 100
}

function callsChip(pct) {
  const p = Number(pct)
  if (!Number.isFinite(p)) return { label: 'Weekly', variant: 'blue', action: 'Review weekly call patterns' }
  if (p > 60) return { label: 'Extreme', variant: 'red', action: 'Surge EMS staffing + staging' }
  if (p > 25) return { label: 'Surging', variant: 'red', action: 'Dispatch extra ambulances to high-demand districts' }
  if (p > 10) return { label: 'Elevated', variant: 'yellow', action: 'Stage additional units near cooling centers' }
  return { label: 'Stable', variant: 'green', action: 'Maintain normal staffing' }
}

function transportChip(pct, severeShare) {
  const p = Number(pct)
  const s = Number(severeShare)
  if ((Number.isFinite(p) && p > 60) || (Number.isFinite(s) && s >= 20)) {
    return { label: 'Critical', variant: 'red', action: 'Alert hospitals and expand cooling transport' }
  }
  if (Number.isFinite(p) && p > 25) return { label: 'High', variant: 'yellow', action: 'Notify ED surge coordinator + EMS triage' }
  return { label: 'Moderate', variant: 'green', action: 'Monitor transport demand' }
}

function coolingChip(pct) {
  const p = Number(pct)
  if (!Number.isFinite(p)) return { label: 'Weekly', variant: 'blue', action: 'Review usage and staffing' }
  if (p > 60) return { label: 'Overwhelmed', variant: 'red', action: 'Open overflow cooling sites in top-2 districts' }
  if (p > 30) return { label: 'Near capacity', variant: 'yellow', action: 'Extend hours at top-visited centers' }
  if (p > 10) return { label: 'Busy', variant: 'yellow', action: 'Increase staffing at peak centers' }
  return { label: 'Normal', variant: 'green', action: 'Maintain current hours' }
}

function computeWeeklyHeatReliefCards({ wb }) {
  const weekly = sheetToObjects(wb, 'Weekly_Summary')
  const weekRow = pickCurrentWeek(weekly)
  if (!weekRow) return { cards: [], weekLabel: 'This week' }

  const weekStart = ymd(weekRow.Week_Start)
  const year = safeNum(weekRow.Year) ?? (parseDateMaybe(weekRow.Week_Start)?.getFullYear() ?? null)

  const weekLabel = fmtWeekLabel(weekRow.Week_Start, weekRow.Week_End)

  // KPI 2: Heat calls
  const thisCalls = safeNum(weekRow.Heat_Related_Calls)
  const sortedWeekly = weekly
    .map((r) => ({ ...r, _ws: parseDateMaybe(r.Week_Start) }))
    .filter((r) => r._ws && (year == null || safeNum(r.Year) === year))
    .sort((a, b) => a._ws.getTime() - b._ws.getTime())
  const idx = sortedWeekly.findIndex((r) => ymd(r.Week_Start) === weekStart)
  const prev7 = idx > 0 ? sortedWeekly.slice(Math.max(0, idx - 7), idx) : []
  const avg7 = rollingAvg(prev7.map((r) => r.Heat_Related_Calls))
  const callsPct = pctChange(thisCalls, avg7)
  const callsChipInfo = callsChip(callsPct)

  // KPI 3: Transport (proxy for ER visits) + severe mix
  const transportRows = sheetToObjects(wb, 'Patient_Transport_Outcome')
  const symptomsRows = sheetToObjects(wb, 'Symptoms')

  const weekTransport = transportRows.filter((r) => ymd(r.Week_Start) === weekStart && (year == null || safeNum(r.Year) === year))
  const transportCount = weekTransport
    .filter((r) => String(r.Outcome || '').toLowerCase() === 'transport')
    .reduce((sum, r) => sum + (safeNum(r.Count) ?? 0), 0)

  const weekSymptoms = symptomsRows.filter((r) => ymd(r.Week_Start) === weekStart && (year == null || safeNum(r.Year) === year))
  const severeCount = weekSymptoms
    .filter((r) => /stroke/i.test(String(r.Heat_Illness || '')))
    .reduce((sum, r) => sum + (safeNum(r.Count) ?? 0), 0)
  const totalSym = weekSymptoms.reduce((sum, r) => sum + (safeNum(r.Count) ?? 0), 0)
  const severeShare = totalSym ? (severeCount / totalSym) * 100 : null
  const topIllness = weekSymptoms.reduce((best, r) => {
    const c = safeNum(r.Count) ?? 0
    if (!best || c > best.c) return { label: String(r.Heat_Illness || '').trim() || 'Heat illness', c }
    return best
  }, null)

  // baseline for transport: use previous 6 weeks
  const transportWeekly = sortedWeekly // same index base
  const prev6 = idx > 0 ? transportWeekly.slice(Math.max(0, idx - 6), idx) : []
  // transport baseline from transportRows aggregated by week start:
  const transportByWeek = new Map()
  for (const r of transportRows) {
    if (year != null && safeNum(r.Year) !== year) continue
    const k = ymd(r.Week_Start)
    if (!k) continue
    const isTransport = String(r.Outcome || '').toLowerCase() === 'transport'
    if (!isTransport) continue
    const v = safeNum(r.Count) ?? 0
    transportByWeek.set(k, (transportByWeek.get(k) || 0) + v)
  }
  const transportAvg6 = rollingAvg(prev6.map((r) => transportByWeek.get(ymd(r.Week_Start)) ?? null))
  const transportPct = pctChange(transportCount, transportAvg6)
  const transportChipInfo = transportChip(transportPct, severeShare)

  // KPI 4: Cooling center usage
  const coolingRows = sheetToObjects(wb, 'Cooling_Center_Visits')
  const weekCooling = coolingRows.filter((r) => ymd(r.Week_Start) === weekStart && (year == null || safeNum(r.Year) === year))
  const totalVisits = weekCooling.reduce((sum, r) => sum + (safeNum(r.Visit_Count) ?? 0), 0)
  const centersOpen = new Set(weekCooling.map((r) => String(r.Cooling_Center || '').trim()).filter(Boolean)).size
  const byDistrict = new Map()
  for (const r of weekCooling) {
    const d = String(r.Council_District || '').trim()
    const v = safeNum(r.Visit_Count) ?? 0
    if (!d) continue
    byDistrict.set(d, (byDistrict.get(d) || 0) + v)
  }
  const topDistrict = [...byDistrict.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

  // baseline for cooling: previous 6 weeks
  const visitsByWeek = new Map()
  for (const r of coolingRows) {
    if (year != null && safeNum(r.Year) !== year) continue
    const k = ymd(r.Week_Start)
    if (!k) continue
    const v = safeNum(r.Visit_Count) ?? 0
    visitsByWeek.set(k, (visitsByWeek.get(k) || 0) + v)
  }
  const coolingAvg6 = rollingAvg(prev6.map((r) => visitsByWeek.get(ymd(r.Week_Start)) ?? null))
  const coolingPct = pctChange(totalVisits, coolingAvg6)
  const coolingChipInfo = coolingChip(coolingPct)

  const cards = [
    {
      id: 'heatCalls',
      title: 'Heat-related EMS / 911 Calls',
      metric: thisCalls != null ? String(thisCalls) : '—',
      metricSuffix: 'this week',
      description: `${callsPct != null ? `${callsPct >= 0 ? '+' : ''}${Math.round(callsPct)}% vs 7-week average` : 'Weekly summary'}`,
      badge: { label: callsChipInfo.label, variant: callsChipInfo.variant },
      action: callsChipInfo.action,
      details: [
        { label: 'This week calls', value: thisCalls != null ? String(thisCalls) : '—' },
        { label: '7-week avg', value: avg7 != null ? String(Math.round(avg7)) : '—' },
        { label: 'Δ vs avg', value: callsPct != null ? `${callsPct >= 0 ? '+' : ''}${Math.round(callsPct)}%` : '—' },
      ],
    },
    {
      id: 'erProxy',
      title: 'ER Heat Illness Visits',
      metric: String(transportCount || 0),
      metricSuffix: 'transports',
      description: `${severeCount || 0} severe · ${topIllness?.label || 'Heat illness'}`,
      badge: { label: transportChipInfo.label, variant: transportChipInfo.variant },
      action: transportChipInfo.action,
      details: [
        { label: 'Transports this week', value: String(transportCount || 0) },
        { label: '6-week avg transports', value: transportAvg6 != null ? String(Math.round(transportAvg6)) : '—' },
        { label: 'Δ vs avg', value: transportPct != null ? `${transportPct >= 0 ? '+' : ''}${Math.round(transportPct)}%` : '—' },
        { label: 'Severe (heat stroke)', value: String(severeCount || 0) },
        { label: 'Severe share', value: Number.isFinite(severeShare) ? `${Math.round(severeShare)}%` : '—' },
      ],
    },
    {
      id: 'coolingUsage',
      title: 'Cooling Center Usage',
      metric: String(totalVisits || 0),
      metricSuffix: 'visits',
      description: `${centersOpen} centers active · top: ${topDistrict}`,
      badge: { label: coolingChipInfo.label, variant: coolingChipInfo.variant },
      action: coolingChipInfo.action,
      details: [
        { label: 'Visits this week', value: String(totalVisits || 0) },
        { label: '6-week avg visits', value: coolingAvg6 != null ? String(Math.round(coolingAvg6)) : '—' },
        { label: 'Δ vs avg', value: coolingPct != null ? `${coolingPct >= 0 ? '+' : ''}${Math.round(coolingPct)}%` : '—' },
        { label: 'Centers active', value: String(centersOpen || 0) },
        { label: 'Top district', value: String(topDistrict || '—') },
      ],
    },
  ]

  return { cards, weekLabel }
}

export default function HeatReliefKPICards({ embedded = false }) {
  const { selectedCity } = usePanelContext()
  const [status, setStatus] = useState({ state: 'idle', error: null })
  const [heatIndexRows, setHeatIndexRows] = useState(null)
  const [heatRelief, setHeatRelief] = useState(null)
  const [actionModal, setActionModal] = useState(null) // card
  const refreshRef = useRef(null)

  const getPlaybook = (card) => {
    const id = String(card?.id || '')
    const sev = String(card?.badge?.label || '').toLowerCase()
    const isCritical = ['critical', 'extreme', 'danger', 'surging', 'overwhelmed', 'near capacity', 'high'].some((k) => sev.includes(k))
    const isElevated = ['elevated', 'busy', 'caution', 'extreme caution'].some((k) => sev.includes(k))

    const base = {
      immediate: [],
      next24h: [],
      monitor: [],
    }

    if (id === 'heatIndex') {
      if (sev.includes('extreme') || sev.includes('danger')) {
        base.immediate.push('Activate heat response escalation and confirm staffing coverage')
        base.immediate.push('Push high-urgency public messaging (hydration, cooling, check-ins)')
        base.next24h.push('Coordinate cooling center hours/extensions and transportation support')
        base.monitor.push('Recheck heat index trend every 30–60 minutes')
      } else if (isElevated) {
        base.immediate.push('Increase outreach messaging and monitor peak hours')
        base.next24h.push('Pre-stage mobile cooling/water resources in high-demand districts')
        base.monitor.push('Watch for rising EMS/transport demand')
      } else {
        base.monitor.push('Maintain routine monitoring and validate forecast peak')
      }
    } else if (id === 'heatCalls') {
      if (isCritical) {
        base.immediate.push('Surge EMS staffing and stage units near highest demand areas')
        base.next24h.push('Coordinate with hospitals and cooling centers for expected demand')
        base.monitor.push('Track daily call composition and hotspot districts')
      } else if (isElevated) {
        base.immediate.push('Stage additional units near cooling centers')
        base.monitor.push('Monitor call growth vs baseline')
      } else {
        base.monitor.push('Maintain normal staffing and review weekly pattern')
      }
    } else if (id === 'erProxy') {
      if (isCritical) {
        base.immediate.push('Alert hospitals/ED surge coordinators and validate bed/transport capacity')
        base.next24h.push('Expand cooling transport and triage guidance')
        base.monitor.push('Monitor severe share (heat stroke) and transport outcomes')
      } else if (isElevated) {
        base.immediate.push('Notify ED leadership and EMS triage')
        base.monitor.push('Watch transport volume and severity mix')
      } else {
        base.monitor.push('Monitor transport trends week-over-week')
      }
    } else if (id === 'coolingUsage') {
      if (sev.includes('overwhelmed') || sev.includes('near capacity')) {
        base.immediate.push('Open overflow sites and extend hours at top-visited centers')
        base.next24h.push('Increase staffing, supplies, and transport assistance')
        base.monitor.push('Track utilization by district and center')
      } else if (isElevated) {
        base.immediate.push('Increase staffing at peak centers')
        base.monitor.push('Watch for sustained growth vs baseline')
      } else {
        base.monitor.push('Maintain current hours and staffing')
      }
    }

    if (!base.immediate.length && !base.next24h.length && !base.monitor.length) {
      base.monitor.push('Review KPI trend and validate data source')
    }
    if (!isCritical && !isElevated && base.immediate.length === 0) {
      base.immediate.push('No immediate action required')
    }

    return {
      severitySummary: isCritical ? 'High urgency' : isElevated ? 'Elevated' : 'Normal',
      ...base,
    }
  }

  useEffect(() => {
    let cancelled = false
    if (selectedCity !== 'phoenix') return

    const load = async () => {
      setStatus({ state: 'loading', error: null })
      try {
        const [wb, hiRows] = await Promise.all([
          loadHeatReliefWorkbook(),
          fetchPhoenixHeatIndexHourly({ pastDays: 2, forecastDays: 1 }),
        ])
        if (cancelled) return
        setHeatIndexRows(hiRows)
        setHeatRelief({ wb })
        setStatus({ state: 'ready', error: null })
      } catch (e) {
        if (cancelled) return
        setStatus({ state: 'error', error: String(e?.message || e) })
      }
    }

    load()
    // refresh every 10 min (matches weather window refresh)
    refreshRef.current = setInterval(load, 10 * 60 * 1000)
    return () => {
      cancelled = true
      if (refreshRef.current) clearInterval(refreshRef.current)
      refreshRef.current = null
    }
  }, [selectedCity])

  const computed = useMemo(() => {
    if (selectedCity !== 'phoenix') return { cards: [] }

    const out = []
    const hiCard = computeHeatIndexCard(heatIndexRows)
    if (hiCard) out.push({ id: 'heatIndex', ...hiCard })

    if (heatRelief?.wb) {
      const wk = computeWeeklyHeatReliefCards({ wb: heatRelief.wb })
      // annotate week label into descriptions (keep consistent)
      for (const c of wk.cards) {
        out.push({
          ...c,
          description: `${wk.weekLabel} · ${c.description}`,
        })
      }
    }
    return { cards: out }
  }, [selectedCity, heatIndexRows, heatRelief])

  if (selectedCity !== 'phoenix') return null

  if (status.state === 'loading' && (!computed.cards || computed.cards.length === 0)) {
    return (
      <div className="w-full">
        <div className="rounded-[10px] border px-3 py-3 text-xs" style={{ borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.03)' }}>
          Loading Heat Relief KPIs…
        </div>
      </div>
    )
  }

  if (status.state === 'error' && (!computed.cards || computed.cards.length === 0)) {
    return (
      <div className="w-full">
        <div className="rounded-[10px] border px-3 py-3 text-xs" style={{ borderColor: 'rgba(255, 142, 142, 0.26)', color: '#ffb0b0', background: 'rgba(140, 44, 44, 0.2)' }}>
          Heat Relief KPIs unavailable: {status.error || 'Failed to load'}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full" style={embedded ? undefined : { width: '300px', maxHeight: '100%' }}>
      <div className="flex flex-col gap-3">
        {computed.cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-[10px]"
            onClick={() => setActionModal(card)}
          >
            <Card
              className="w-full flex flex-col transition-all duration-200 border weather-overlay-surface weather-overlay-soft-card"
              style={{
                borderColor: 'var(--color-gray-700)',
                borderRadius: 10,
              }}
            >
              <CardHeader className="flex-1 min-h-0 py-4 justify-between">
                <CardTitle className="text-[11px] font-semibold leading-tight uppercase tracking-wide" style={{ color: 'var(--color-gray-400)' }}>
                  {card.title}
                </CardTitle>

                <div className="flex items-baseline gap-2">
                  <span className="text-[28px] font-semibold leading-none" style={{ color: 'var(--color-gray-100)' }}>
                    {card.metric}
                  </span>
                  <span className="text-[13px] font-medium leading-tight" style={{ color: 'var(--color-gray-300)' }}>
                    {card.metricSuffix}
                  </span>
                </div>

                <p className="text-[12px] font-normal leading-snug text-white/40">
                  {card.description}
                </p>

                <div className="flex items-center justify-between gap-3">
                  <Badge label={card.badge?.label} variant={card.badge?.variant} />
                  <span
                    className="text-[11px] font-semibold truncate text-left"
                    style={{ color: 'rgba(255,255,255,0.72)', maxWidth: 155 }}
                    title={card.action}
                  >
                    {card.action}
                  </span>
                </div>
              </CardHeader>
            </Card>
          </button>
        ))}
      </div>

      {actionModal && (
        (() => {
          const playbook = getPlaybook(actionModal)
          const details = Array.isArray(actionModal.details) ? actionModal.details : []
          return (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{
            zIndex: 220,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(2px)',
            pointerEvents: 'auto',
          }}
          role="dialog"
          aria-modal="true"
          aria-label="KPI recommendation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setActionModal(null)
          }}
        >
          <div
            className="rounded-[12px] border shadow-xl overflow-hidden"
            style={{
              width: 520,
              maxWidth: 'calc(100vw - 32px)',
              background: 'rgba(23, 23, 23, 0.95)',
              backdropFilter: 'blur(12px) saturate(160%)',
              borderColor: 'rgba(255,255,255,0.10)',
              boxShadow: '0 18px 40px rgba(0,0,0,0.55), 0 10px 18px rgba(0,0,0,0.35)',
            }}
          >
            <div className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Recommendation playbook
                </div>
                <div className="text-[14px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.92)' }}>
                  {actionModal.title}
                </div>
              </div>
              <button
                type="button"
                className="h-8 px-3 rounded-[10px] border text-[12px] font-semibold"
                style={{
                  borderColor: 'rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.85)',
                  background: 'rgba(255,255,255,0.04)',
                }}
                onClick={() => setActionModal(null)}
              >
                Close
              </button>
            </div>

            <div className="px-4 pb-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Badge label={actionModal.badge?.label || 'Status'} variant={actionModal.badge?.variant || 'blue'} />
                  <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.72)' }}>
                    {playbook.severitySummary}
                  </span>
                </div>
              </div>

              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr' }}>
                <div
                  className="rounded-[10px] border px-3 py-3"
                  style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
                >
                  <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    Primary recommendation
                  </div>
                  <div className="text-[13px] leading-snug" style={{ color: 'rgba(255,255,255,0.92)', whiteSpace: 'pre-wrap' }}>
                    {actionModal.action}
                  </div>
                </div>

                {details.length > 0 && (
                  <div
                    className="rounded-[10px] border px-3 py-3"
                    style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
                  >
                    <div className="text-[11px] uppercase tracking-wide mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      Why this triggered
                    </div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      {details.map((d) => (
                        <div key={d.label} className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            {d.label}
                          </div>
                          <div className="text-[13px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>
                            {d.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  className="rounded-[10px] border px-3 py-3"
                  style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
                >
                  <div className="text-[11px] uppercase tracking-wide mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    Recommended actions
                  </div>

                  {playbook.immediate?.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        Immediate
                      </div>
                      <ul className="text-[13px] leading-snug" style={{ color: 'rgba(255,255,255,0.9)', listStyle: 'disc', paddingLeft: 18 }}>
                        {playbook.immediate.map((t) => <li key={t}>{t}</li>)}
                      </ul>
                    </div>
                  )}

                  {playbook.next24h?.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        Next 24 hours
                      </div>
                      <ul className="text-[13px] leading-snug" style={{ color: 'rgba(255,255,255,0.9)', listStyle: 'disc', paddingLeft: 18 }}>
                        {playbook.next24h.map((t) => <li key={t}>{t}</li>)}
                      </ul>
                    </div>
                  )}

                  {playbook.monitor?.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        Monitor
                      </div>
                      <ul className="text-[13px] leading-snug" style={{ color: 'rgba(255,255,255,0.9)', listStyle: 'disc', paddingLeft: 18 }}>
                        {playbook.monitor.map((t) => <li key={t}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
          )
        })()
      )}
    </div>
  )
}


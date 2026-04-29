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
      return { ...r, _ws: ws }
    })
    .filter((r) => r._ws)

  if (!candidates.length) return null
  const onOrBefore = candidates.filter((r) => r._ws.getTime() <= today.getTime())
  const pool = onOrBefore.length ? onOrBefore : candidates
  return pool.reduce((best, r) => (!best || r._ws.getTime() > best._ws.getTime() ? r : best), null)
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

/**
 * Builds cooling center points from the Heat Relief workbook.
 * - Uses the most recent Week_Start <= today (from Weekly_Summary)
 * - Aggregates visit counts per center for that week
 */
export async function buildPhoenixCoolingCentersGeojson() {
  const wb = await loadHeatReliefWorkbook()
  const weekly = sheetToObjects(wb, 'Weekly_Summary')
  const weekRow = pickCurrentWeek(weekly)
  const weekStartKey = weekRow ? ymd(weekRow.Week_Start) : null
  const year = weekRow ? (safeNum(weekRow.Year) ?? (parseDateMaybe(weekRow.Week_Start)?.getFullYear() ?? null)) : null

  const rows = sheetToObjects(wb, 'Cooling_Center_Visits')
  const filtered = rows.filter((r) => {
    if (weekStartKey && ymd(r.Week_Start) !== weekStartKey) return false
    if (year != null && safeNum(r.Year) !== year) return false
    return true
  })

  // Aggregate by center name + coordinates (prefer coordinates).
  const byKey = new Map()
  for (const r of filtered) {
    const name = String(r.Cooling_Center || '').trim()
    const address = String(r.Address || '').trim()
    const district = String(r.Council_District || '').trim()
    const lat = safeNum(r.Latitude)
    const lng = safeNum(r.Longitude)
    const visits = safeNum(r.Visit_Count) ?? 0
    if (!name) continue
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const k = `${name}__${lat.toFixed(5)}__${lng.toFixed(5)}`
    const prev = byKey.get(k) || { name, address, district, lat, lng, visits: 0 }
    prev.visits += visits
    // keep the most informative address/district if present
    if (!prev.address && address) prev.address = address
    if (!prev.district && district) prev.district = district
    byKey.set(k, prev)
  }

  const features = [...byKey.values()].map((c) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
    properties: {
      name: c.name,
      address: c.address || null,
      councilDistrict: c.district || null,
      visitCount: Number.isFinite(c.visits) ? Math.round(c.visits) : null,
      weekStart: weekStartKey || null,
      year: year ?? null,
    },
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Returns a displayable historical coverage range for cooling center data.
 * Uses Weekly_Summary (Week_Start + Week_End) as the authoritative range.
 */
export async function getPhoenixCoolingCentersHistoricalCoverage() {
  const wb = await loadHeatReliefWorkbook()
  const weekly = sheetToObjects(wb, 'Weekly_Summary')
  let minStart = null
  let maxEnd = null
  for (const r of weekly || []) {
    const ws = String(r?.Week_Start || '').trim()
    const we = String(r?.Week_End || '').trim()
    if (ws) {
      if (!minStart || ws < minStart) minStart = ws
    }
    if (we) {
      if (!maxEnd || we > maxEnd) maxEnd = we
    }
  }
  if (!minStart || !maxEnd) return null
  const minMs = Date.parse(minStart + 'T00:00:00Z')
  const maxMs = Date.parse(maxEnd + 'T00:00:00Z')
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return null
  const start = new Date(minMs)
  const end = new Date(maxMs)
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startStr}–${endStr}`
}


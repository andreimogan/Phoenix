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

function buildWeekCandidates(weeklySummaryRows) {
  return (weeklySummaryRows || [])
    .map((r) => {
      const ws = parseDateMaybe(r.Week_Start)
      return { ...r, _ws: ws }
    })
    .filter((r) => r._ws)
}

/**
 * Latest reporting week with Week_Start on or before end of `asOfDate` (calendar-driven).
 * Falls back like pickCurrentWeek when no week is on/before as-of (empty pool uses all candidates).
 */
function pickWeekRowForAsOfDate(weeklySummaryRows, asOfDate) {
  const asOf = asOfDate instanceof Date && !Number.isNaN(asOfDate.getTime()) ? asOfDate : new Date()
  const asOfEnd = new Date(asOf)
  asOfEnd.setHours(23, 59, 59, 999)
  const asOfMs = asOfEnd.getTime()
  const candidates = buildWeekCandidates(weeklySummaryRows)
  if (!candidates.length) return null
  const onOrBefore = candidates.filter((r) => r._ws.getTime() <= asOfMs)
  const pool = onOrBefore.length ? onOrBefore : candidates
  return pool.reduce((best, r) => (!best || r._ws.getTime() > best._ws.getTime() ? r : best), null)
}

function formatWeekRangeLabel(weekStartRaw, weekEndRaw) {
  const a = parseDateMaybe(weekStartRaw)
  const b = parseDateMaybe(weekEndRaw)
  if (!a) return ''
  const opts = { month: 'short', day: 'numeric', year: 'numeric' }
  const startStr = a.toLocaleDateString('en-US', opts)
  if (!b) return startStr
  const endStr = b.toLocaleDateString('en-US', opts)
  return `${startStr} – ${endStr}`
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

/** Span of all weekly reporting periods in the workbook (authoritative “data exists from … to …”). */
function weeklySummarySpanFromWorkbook(wb) {
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
  const opts = { month: 'short', day: 'numeric', year: 'numeric' }
  const startLabel = start.toLocaleDateString('en-US', opts)
  const endLabel = end.toLocaleDateString('en-US', opts)
  return {
    startLabel,
    endLabel,
    /** Legacy compact string used by map footnotes */
    coverageCompact: `${startLabel}–${endLabel}`,
    rangeLabel: `${startLabel} – ${endLabel}`,
  }
}

function normalizeCoolingCenterName(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  // Unify known naming variants so duplicate sites collapse.
  return s
    .replace(/\s*-\s*Cooling Center\s*$/i, '')
    .replace(/\s*-\s*Respite\s*$/i, '')
    .replace(/\s*Heat Relief\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function siteKeyFromRow(r) {
  const address = String(r?.Address || '').trim().toLowerCase()
  const lat = safeNum(r?.Latitude)
  const lng = safeNum(r?.Longitude)
  if (address && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${address}__${lat.toFixed(5)}__${lng.toFixed(5)}`
  }
  const name = normalizeCoolingCenterName(r?.Cooling_Center)
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return ''
  return `${name.toLowerCase()}__${lat.toFixed(5)}__${lng.toFixed(5)}`
}

function capacityEstimateForSite({ name, address }) {
  const addr = String(address || '').trim().toLowerCase()
  const nm = normalizeCoolingCenterName(name).toLowerCase()

  // Rule: 30 sq ft per person (seated respite proxy) unless explicitly stated/overridden.
  // Burton Barr: explicit ~50 people at a time reported publicly.
  if (nm.includes('burton barr')) return 50
  // Senior Opportunities West: user-provided placeholder.
  if (nm.includes('senior opportunities west')) return 100

  // Site square footage approximations (from public sources; used only to estimate).
  const sqft =
    addr.includes('20 w jackson st') ? 21048
      : addr.includes('10050 n metro pkwy e') ? 30000
        : addr.includes('1325 s 5th ave') ? 12400
          : addr.includes('5648 n 15th ave') ? 10000
            : null

  if (!Number.isFinite(sqft)) return null
  return Math.max(1, Math.floor(sqft / 30))
}

function aggregateCoolingVisitsByLocation(rows) {
  const byKey = new Map()
  for (const r of rows) {
    const name = normalizeCoolingCenterName(r.Cooling_Center)
    const address = String(r.Address || '').trim()
    const district = String(r.Council_District || '').trim()
    const lat = safeNum(r.Latitude)
    const lng = safeNum(r.Longitude)
    const visits = safeNum(r.Visit_Count) ?? 0
    if (!name) continue
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const k = siteKeyFromRow(r)
    if (!k) continue
    const prev = byKey.get(k) || { name, address, district, lat, lng, visits: 0 }
    prev.visits += visits
    if (!prev.address && address) prev.address = address
    if (!prev.district && district) prev.district = district
    // Prefer a more canonical/shorter name if we see variants.
    if (name && (!prev.name || name.length < prev.name.length)) prev.name = name
    byKey.set(k, prev)
  }
  return byKey
}

/**
 * Every cooling center location that appears anywhere in the visits sheet with valid name + coordinates.
 * Visit counts are per `countMap` (week slice or full history); missing key ⇒ 0 for that scope.
 */
function buildFeatureCollectionForUnion(unionByKey, countMap, sharedProps) {
  const features = []
  for (const [k, base] of unionByKey) {
    const slot = countMap.get(k)
    const raw = slot != null ? slot.visits : 0
    const vc = Number.isFinite(raw) ? Math.round(raw) : 0
    const cap = capacityEstimateForSite({ name: base.name, address: base.address })
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [base.lng, base.lat] },
      properties: {
        name: base.name,
        address: base.address || null,
        councilDistrict: base.district || null,
        visitCount: vc,
        capacityEstimate: Number.isFinite(cap) ? cap : null,
        ...sharedProps,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

/**
 * Builds cooling center points from the Heat Relief workbook.
 * @param {Date} [asOfDate] — With mode `current` (default): latest week with Week_Start ≤ end of this calendar day. Ignored when mode is `all_historical`.
 * @param {{ mode?: 'current' | 'all_historical' }} [options]
 */
export async function buildPhoenixCoolingCentersGeojson(asOfDate, options = {}) {
  const mode = options.mode === 'all_historical' ? 'all_historical' : 'current'
  const wb = await loadHeatReliefWorkbook()
  const allRows = sheetToObjects(wb, 'Cooling_Center_Visits')
  /** Full set of map pins: any row in the sheet with name + valid lat/lng */
  const unionByKey = aggregateCoolingVisitsByLocation(allRows)

  if (mode === 'all_historical') {
    const span = weeklySummarySpanFromWorkbook(wb)
    const rangeLabel = span?.rangeLabel || ''
    return buildFeatureCollectionForUnion(unionByKey, unionByKey, {
      coolingTimeMode: 'all_historical',
      weekStart: null,
      weekEnd: null,
      weekRangeLabel: rangeLabel || null,
      year: null,
    })
  }

  const weekly = sheetToObjects(wb, 'Weekly_Summary')
  const asOf = asOfDate instanceof Date && !Number.isNaN(asOfDate.getTime()) ? asOfDate : new Date()
  const weekRow = pickWeekRowForAsOfDate(weekly, asOf)
  const weekStartKey = weekRow ? ymd(weekRow.Week_Start) : null
  const year = weekRow ? (safeNum(weekRow.Year) ?? (parseDateMaybe(weekRow.Week_Start)?.getFullYear() ?? null)) : null
  const weekEndKey = weekRow?.Week_End != null ? String(weekRow.Week_End).trim() : ''
  const weekRangeLabel = weekRow
    ? formatWeekRangeLabel(weekRow.Week_Start, weekRow.Week_End)
    : ''

  const filtered = allRows.filter((r) => {
    if (weekStartKey && ymd(r.Week_Start) !== weekStartKey) return false
    if (year != null && safeNum(r.Year) !== year) return false
    return true
  })
  const weekCountsByKey = aggregateCoolingVisitsByLocation(filtered)

  return buildFeatureCollectionForUnion(unionByKey, weekCountsByKey, {
    coolingTimeMode: 'current',
    weekStart: weekStartKey || null,
    weekEnd: weekEndKey || null,
    weekRangeLabel: weekRangeLabel || null,
    year: year ?? null,
  })
}

/**
 * Summary for UI (layers panel): aligned with map points for the selected time mode.
 * @param {'current' | 'all_historical'} [timeMode]
 */
export async function getPhoenixCoolingCentersContext(asOfDate, timeMode = 'current') {
  const mode = timeMode === 'all_historical' ? 'all_historical' : 'current'
  const wb = await loadHeatReliefWorkbook()

  if (mode === 'all_historical') {
    const span = weeklySummarySpanFromWorkbook(wb)
    if (!span) {
      return { ok: false, mode, label: 'No weekly summary in workbook', weekRangeLabel: null }
    }
    const rows = sheetToObjects(wb, 'Cooling_Center_Visits')
    let totalVisits = 0
    for (const r of rows) {
      totalVisits += safeNum(r.Visit_Count) ?? 0
    }
    const byLoc = aggregateCoolingVisitsByLocation(rows)

    return {
      ok: true,
      mode,
      dataStartLabel: span.startLabel,
      dataEndLabel: span.endLabel,
      weekRangeLabel: span.rangeLabel,
      totalVisits: Math.round(totalVisits),
      /** Same as `buildPhoenixCoolingCentersGeojson` feature count (dots on the map) */
      mappedLocationCount: byLoc.size,
    }
  }

  const asOf = asOfDate instanceof Date && !Number.isNaN(asOfDate.getTime()) ? asOfDate : new Date()
  const weekly = sheetToObjects(wb, 'Weekly_Summary')
  const weekRow = pickWeekRowForAsOfDate(weekly, asOf)
  if (!weekRow) {
    return { ok: false, mode, label: 'No weekly summary in workbook', weekRangeLabel: null }
  }
  const weekStartKey = ymd(weekRow.Week_Start)
  const year = safeNum(weekRow.Year) ?? (parseDateMaybe(weekRow.Week_Start)?.getFullYear() ?? null)
  const weekRangeLabel = formatWeekRangeLabel(weekRow.Week_Start, weekRow.Week_End)

  const allRows = sheetToObjects(wb, 'Cooling_Center_Visits')
  const unionLoc = aggregateCoolingVisitsByLocation(allRows)
  const filtered = allRows.filter((r) => {
    if (weekStartKey && ymd(r.Week_Start) !== weekStartKey) return false
    if (year != null && safeNum(r.Year) !== year) return false
    return true
  })

  let totalVisits = 0
  for (const r of filtered) {
    totalVisits += safeNum(r.Visit_Count) ?? 0
  }

  return {
    ok: true,
    mode,
    asOfLabel: asOf.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    weekStartKey,
    year,
    weekRangeLabel,
    totalVisits: Math.round(totalVisits),
    mappedLocationCount: unionLoc.size,
  }
}

/** @deprecated Prefer getPhoenixCoolingCentersContext(asOf, 'current') */
export async function getPhoenixCoolingCentersWeekContext(asOfDate) {
  return getPhoenixCoolingCentersContext(asOfDate, 'current')
}

/**
 * Returns a displayable historical coverage range for cooling center data.
 * Uses Weekly_Summary (Week_Start + Week_End) as the authoritative range.
 */
export async function getPhoenixCoolingCentersHistoricalCoverage() {
  const wb = await loadHeatReliefWorkbook()
  const span = weeklySummarySpanFromWorkbook(wb)
  return span ? span.coverageCompact : null
}


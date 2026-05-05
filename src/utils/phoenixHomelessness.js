import Papa from 'papaparse'

const parseUsDateToUtcMs = (raw) => {
  // Example: "7/31/2022" or "07/31/2022"
  const m = String(raw || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const mm = Number(m[1])
  const dd = Number(m[2])
  const yyyy = Number(m[3])
  if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yyyy)) return null
  const d = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0))
  if (Number.isNaN(d.getTime())) return null
  return d.getTime()
}

export function parsePhoenixHomelessnessCsv(csvText) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })
  if (parsed.errors?.length) {
    const first = parsed.errors[0]
    throw new Error(first?.message || 'Failed to parse Phoenix homelessness CSV')
  }
  return (parsed.data || [])
    .map((r) => {
      const periodMs = parseUsDateToUtcMs(r.PERIOD)
      const value = Number(String(r.VALUE ?? '').replace(/,/g, ''))
      return {
        fiscalYear: String(r.FISCAL_YEAR || '').trim() || null,
        periodRaw: String(r.PERIOD || '').trim() || null,
        periodMs,
        category: String(r.CATEGORY || '').trim() || null,
        type: String(r.TYPE || '').trim() || null,
        metric: String(r.METRIC || '').trim() || null,
        value: Number.isFinite(value) ? value : null,
        periodFlag: String(r.PERIOD_FLAG || '').trim() || null,
      }
    })
    .filter((r) => r.periodMs && r.category && r.metric && Number.isFinite(r.value))
}

const METRIC_PRIORITY = [
  'Cumulative Total Served',
  'Cumulative Served this Fiscal Year',
  'Total Served',
]

function pickBestRowByMetricPriority(rowsForCategory) {
  if (!rowsForCategory?.length) return null
  return rowsForCategory.reduce((best, r) => {
    if (!best) return r
    const br = METRIC_PRIORITY.indexOf(best.metric)
    const rr = METRIC_PRIORITY.indexOf(r.metric)
    const bs = br === -1 ? 999 : br
    const rs = rr === -1 ? 999 : rr
    if (rs < bs) return r
    if (rs > bs) return best
    // same metric preference: pick larger value (cumulative tends to grow)
    return (r.value ?? 0) > (best.value ?? 0) ? r : best
  }, null)
}

function monthKeyFromMs(ms) {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function monthLabelFromKey(key) {
  const m = String(key || '').match(/^(\d{4})-(\d{2})$/)
  if (!m) return String(key || '')
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1, 0, 0, 0, 0))
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function getPhoenixHomelessnessSnapshot(rows, asOfDate) {
  const asOfTime = asOfDate instanceof Date ? asOfDate.getTime() : Date.now()

  const eligible = rows.filter((r) => r.periodMs <= asOfTime)
  if (!eligible.length) return null

  // Find latest period <= asOfDate
  let latestPeriodMs = 0
  for (const r of eligible) {
    if (r.periodMs > latestPeriodMs) latestPeriodMs = r.periodMs
  }

  const latestRows = eligible.filter((r) => r.periodMs === latestPeriodMs)

  // Reduce to best row per CATEGORY (choose metric by priority)
  const byCategory = new Map()
  for (const r of latestRows) {
    const key = r.category
    const current = byCategory.get(key)
    if (!current) {
      byCategory.set(key, r)
      continue
    }

    const currRank = METRIC_PRIORITY.indexOf(current.metric)
    const nextRank = METRIC_PRIORITY.indexOf(r.metric)
    const currScore = currRank === -1 ? 999 : currRank
    const nextScore = nextRank === -1 ? 999 : nextRank

    if (nextScore < currScore) {
      byCategory.set(key, r)
      continue
    }

    // If same metric preference, choose larger value (usually cumulative grows)
    if (nextScore === currScore && (r.value ?? 0) > (current.value ?? 0)) {
      byCategory.set(key, r)
    }
  }

  const categories = Array.from(byCategory.values())
    .sort((a, b) => String(a.category).localeCompare(String(b.category)))
    .map((r) => ({
      category: r.category,
      metric: r.metric,
      value: r.value,
    }))

  return {
    periodMs: latestPeriodMs,
    periodLabel: new Date(latestPeriodMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    categories,
  }
}

/**
 * All-time people served by category.
 * Uses the latest period in the dataset and prefers "Cumulative Total Served" when present.
 */
export function getPhoenixHomelessnessAllTimeSnapshot(rows) {
  const all = rows || []
  if (!all.length) return null
  let latestPeriodMs = 0
  for (const r of all) {
    if (r?.periodMs && r.periodMs > latestPeriodMs) latestPeriodMs = r.periodMs
  }
  if (!latestPeriodMs) return null
  const latestRows = all.filter((r) => r.periodMs === latestPeriodMs)
  const byCategory = new Map()
  for (const r of latestRows) {
    const key = r.category
    const prev = byCategory.get(key) || []
    prev.push(r)
    byCategory.set(key, prev)
  }
  const categories = Array.from(byCategory.entries())
    .map(([category, bucket]) => {
      const best = pickBestRowByMetricPriority(bucket)
      return best ? { category, metric: best.metric, value: best.value } : null
    })
    .filter(Boolean)
    .sort((a, b) => String(a.category).localeCompare(String(b.category)))

  return {
    mode: 'all_historical',
    periodMs: latestPeriodMs,
    periodLabel: 'All time',
    categories,
  }
}

/**
 * Current-time (monthly) people served by category for the selected month.
 * If the chosen metric is cumulative, it uses delta vs previous month; if it's already monthly (Total Served), it uses value directly.
 */
export function getPhoenixHomelessnessMonthSnapshot(rows, selectedDate) {
  const d = selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime()) ? selectedDate : new Date()
  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const all = rows || []
  if (!all.length) return null

  const rowsInMonth = all.filter((r) => r?.periodMs && monthKeyFromMs(r.periodMs) === monthKey)
  if (!rowsInMonth.length) {
    // Forecast missing future months (no observed rows) through Aug 2026, based on recent history.
    // This supports the "current time" experience when calendar dates move past the last observed month.
    const FORECAST_THROUGH_MONTH = '2026-08'

    // Determine last observed month.
    let maxPeriodMs = 0
    for (const r of all) {
      if (r?.periodMs && r.periodMs > maxPeriodMs) maxPeriodMs = r.periodMs
    }
    const lastObservedMonth = maxPeriodMs ? monthKeyFromMs(maxPeriodMs) : null

    const isFutureMonth = lastObservedMonth && monthKey > lastObservedMonth
    const withinHorizon = monthKey <= FORECAST_THROUGH_MONTH
    if (!isFutureMonth || !withinHorizon) return null

    // Build monthly served history per category for the last few observed months.
    const monthsDesc = []
    // Collect unique month keys in descending order up to N.
    const monthKeys = Array.from(new Set(all.filter((r) => r?.periodMs).map((r) => monthKeyFromMs(r.periodMs))))
      .filter(Boolean)
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))

    const LOOKBACK_MONTHS = 4
    for (const mk of monthKeys) {
      if (lastObservedMonth && mk > lastObservedMonth) continue
      monthsDesc.push(mk)
      if (monthsDesc.length >= LOOKBACK_MONTHS) break
    }
    if (!monthsDesc.length) return null

    // Helper: compute observed month served for a specific monthKey using the same metric preference rules.
    const computeObservedMonthServed = (mk) => {
      const bucket = all.filter((r) => r?.periodMs && monthKeyFromMs(r.periodMs) === mk)
      if (!bucket.length) return new Map()
      let endMs = 0
      for (const r of bucket) {
        if (r.periodMs > endMs) endMs = r.periodMs
      }
      const endRows = bucket.filter((r) => r.periodMs === endMs)

      let prevEndMs = 0
      for (const r of all) {
        if (r?.periodMs && r.periodMs < endMs && r.periodMs > prevEndMs) prevEndMs = r.periodMs
      }
      const prevRows = prevEndMs ? all.filter((r) => r.periodMs === prevEndMs) : []

      const byCatEnd = new Map()
      for (const r of endRows) {
        const key = r.category
        const prev = byCatEnd.get(key) || []
        prev.push(r)
        byCatEnd.set(key, prev)
      }
      const byCatPrev = new Map()
      for (const r of prevRows) {
        const key = r.category
        const prev = byCatPrev.get(key) || []
        prev.push(r)
        byCatPrev.set(key, prev)
      }

      const out = new Map()
      for (const [category, catRows] of byCatEnd.entries()) {
        const endBest = pickBestRowByMetricPriority(catRows)
        if (!endBest) continue
        const metric = String(endBest.metric || '')
        const endVal = Number.isFinite(endBest.value) ? endBest.value : null
        if (!Number.isFinite(endVal)) continue

        if (/^cumulative/i.test(metric)) {
          const prevBest = pickBestRowByMetricPriority((byCatPrev.get(category) || []).filter((r) => String(r.metric || '') === metric))
          const prevVal = prevBest && Number.isFinite(prevBest.value) ? prevBest.value : 0
          out.set(category, Math.max(0, endVal - (Number.isFinite(prevVal) ? prevVal : 0)))
        } else {
          out.set(category, endVal)
        }
      }
      return out
    }

    const historyByMonth = monthsDesc.map((mk) => computeObservedMonthServed(mk))
    const allCats = new Set()
    historyByMonth.forEach((m) => { for (const k of m.keys()) allCats.add(k) })

    const categories = Array.from(allCats)
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((category) => {
        const vals = historyByMonth
          .map((m) => m.get(category))
          .filter((v) => Number.isFinite(v))
        if (!vals.length) return null
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length
        return { category, metric: 'People served (month)', value: Math.max(0, Math.round(avg)) }
      })
      .filter(Boolean)

    return {
      mode: 'current',
      isForecast: true,
      periodMs: null,
      periodLabel: `${monthLabelFromKey(monthKey)} (forecast)`,
      categories,
    }
  }
  // Use the latest period within the month (typically month-end date).
  let endMs = 0
  for (const r of rowsInMonth) {
    if (r.periodMs > endMs) endMs = r.periodMs
  }
  const endRows = rowsInMonth.filter((r) => r.periodMs === endMs)

  // Previous month end (latest period < endMs)
  let prevEndMs = 0
  for (const r of all) {
    if (r?.periodMs && r.periodMs < endMs && r.periodMs > prevEndMs) prevEndMs = r.periodMs
  }
  const prevRows = prevEndMs ? all.filter((r) => r.periodMs === prevEndMs) : []

  const byCatEnd = new Map()
  for (const r of endRows) {
    const key = r.category
    const prev = byCatEnd.get(key) || []
    prev.push(r)
    byCatEnd.set(key, prev)
  }
  const byCatPrev = new Map()
  for (const r of prevRows) {
    const key = r.category
    const prev = byCatPrev.get(key) || []
    prev.push(r)
    byCatPrev.set(key, prev)
  }

  const categories = Array.from(byCatEnd.entries())
    .map(([category, bucket]) => {
      const endBest = pickBestRowByMetricPriority(bucket)
      if (!endBest) return null
      const metric = String(endBest.metric || '')
      const endVal = Number.isFinite(endBest.value) ? endBest.value : null
      if (!Number.isFinite(endVal)) return null

      // If it's cumulative, diff vs previous month same metric (if available); else use the value as-is.
      if (/^cumulative/i.test(metric)) {
        const prevBest = pickBestRowByMetricPriority((byCatPrev.get(category) || []).filter((r) => String(r.metric || '') === metric))
        const prevVal = prevBest && Number.isFinite(prevBest.value) ? prevBest.value : 0
        const delta = endVal - (Number.isFinite(prevVal) ? prevVal : 0)
        return { category, metric: 'People served (month)', value: Math.max(0, delta) }
      }

      // Total Served (already monthly)
      return { category, metric: 'People served (month)', value: endVal }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.category).localeCompare(String(b.category)))

  return {
    mode: 'current',
    periodMs: endMs,
    periodLabel: monthLabelFromKey(monthKey),
    categories,
  }
}


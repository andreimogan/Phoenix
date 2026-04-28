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


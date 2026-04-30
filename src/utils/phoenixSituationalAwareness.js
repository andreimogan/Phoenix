import phoenixHeatIllnessesSyntheticDemo from '../data/phoenixHeatIllnessesSyntheticDemo.json'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Top 2 council districts by forecast heat-illness Count whose weekly buckets
 * overlap [asOfDate, asOfDate + 16d]. If no FORECAST_2026 row overlaps that
 * window (typical when asOfDate sits in 2024/2025), fall back to the earliest
 * 2 forecast weeks per district so the layer is still meaningful for demo
 * dates.
 *
 * Returns an array sorted desc by count, capped to 2:
 *   [{ districtId: '5', count: 248 }, { districtId: '7', count: 191 }]
 */
export function computeHeatTop2DistrictsNext16Days(asOfDate) {
  const rows = phoenixHeatIllnessesSyntheticDemo?.rows || []
  const start = asOfDate instanceof Date ? asOfDate.getTime() : Date.now()
  const end = start + 16 * MS_PER_DAY

  const byDistrict = new Map()
  for (const r of rows) {
    if (r?.Data_Type !== 'FORECAST_2026') continue
    const ws = r?.Week_Start
    const districtId = String(r?.Council_District ?? '').trim()
    if (!ws || !districtId) continue
    const ms = Date.parse(`${ws}T00:00:00Z`)
    if (!Number.isFinite(ms)) continue
    const count = Number(r.Count) || 0
    if (!byDistrict.has(districtId)) byDistrict.set(districtId, new Map())
    const weeks = byDistrict.get(districtId)
    weeks.set(ms, (weeks.get(ms) || 0) + count)
  }
  if (!byDistrict.size) return []

  const ranked = []
  for (const [districtId, weeks] of byDistrict) {
    const sorted = [...weeks.entries()].sort((a, b) => a[0] - b[0])
    const overlapping = sorted.filter(([wsMs]) => {
      const weekEnd = wsMs + 6 * MS_PER_DAY
      return weekEnd >= start && wsMs <= end
    })
    const window = overlapping.length ? overlapping : sorted.slice(0, 2)
    const sum = window.reduce((acc, [, c]) => acc + c, 0)
    if (sum > 0) ranked.push({ districtId, count: sum })
  }
  return ranked.sort((a, b) => b.count - a.count).slice(0, 2)
}

export function formatHeatLabel(count) {
  if (!Number.isFinite(count) || count <= 0) return ''
  if (count >= 1000) return `Heat: ~${(count / 1000).toFixed(1)}k cases (16d)`
  return `Heat: ~${Math.round(count)} cases (16d)`
}

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const EXTERNAL = path.join(ROOT, 'External Datasets')
const OUT = path.join(ROOT, 'src', 'data', 'chatbotKnowledgeBase.txt')
const INTERNAL_DATA = path.join(ROOT, 'src', 'data')

function readText(p) {
  return fs.readFileSync(p, 'utf-8')
}

function safeParseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function csvLines(text, maxLines = 2000) {
  const lines = String(text || '').split('\n')
  return lines.slice(0, Math.min(lines.length, maxLines)).filter((l) => l.trim().length > 0)
}

function parseCsvHeader(line) {
  return String(line || '').split(',').map((h) => h.replace(/^\"|\"$/g, '').trim())
}

function csvValue(line, idx) {
  const parts = String(line || '').split(',')
  return String(parts[idx] ?? '').replace(/^\"|\"$/g, '').trim()
}

function buildVillagesSummary() {
  const p = path.join(EXTERNAL, 'Villages.geojson')
  const geo = safeParseJson(readText(p))
  const names = (geo?.features || [])
    .map((f) => f?.properties?.NAME)
    .filter(Boolean)
    .sort()
  return [
    '## Phoenix Neighborhood Boundaries (Villages)',
    `- Source file: Villages.geojson`,
    `- Neighborhoods (${names.length}): ${names.join(', ')}`,
    '',
  ].join('\n')
}

function buildHomelessnessSummary() {
  const p = path.join(EXTERNAL, 'PhoenixHomelesness.csv')
  const lines = csvLines(readText(p), 2000)
  const header = parseCsvHeader(lines[0] || '')
  const idxCategory = header.findIndex((h) => /category/i.test(h))
  const idxValue = header.findIndex((h) => /^value$/i.test(h))
  const idxPeriod = header.findIndex((h) => /period/i.test(h) || /date/i.test(h))
  const idxNeighborhood = header.findIndex((h) => /neigh/i.test(h) || /village/i.test(h))

  const byCategory = new Map()
  for (const ln of lines.slice(1)) {
    const cat = idxCategory >= 0 ? csvValue(ln, idxCategory) : ''
    const val = idxValue >= 0 ? Number(csvValue(ln, idxValue)) : NaN
    if (!cat || !Number.isFinite(val)) continue
    byCategory.set(cat, (byCategory.get(cat) || 0) + val)
  }
  const cats = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])

  return [
    '## Phoenix Homelessness Services (Monthly)',
    `- Source file: PhoenixHomelesness.csv`,
    `- Columns observed: ${header.filter(Boolean).slice(0, 24).join(', ')}${header.length > 24 ? ', …' : ''}`,
    `- Notes: This dataset represents people served by homelessness-related services (not a direct homelessness count).`,
    `- Top categories in sampled rows:`,
    ...cats.slice(0, 10).map(([c, v]) => `  - ${c}: ${Math.round(v).toLocaleString()}`),
    idxPeriod >= 0 ? `- Period column present: ${header[idxPeriod]}` : '- Period column: (not detected in sample parse)',
    idxNeighborhood >= 0 ? `- Neighborhood/village column present: ${header[idxNeighborhood]}` : '- Neighborhood/village column: (not detected in sample parse)',
    '',
  ].join('\n')
}

function buildCallsForServiceSummary() {
  const p = path.join(EXTERNAL, 'calls-for-service_2026-calls-for-service_callsforsrvc2026.csv')
  const text = readText(p)
  const lines = csvLines(text, 20000) // read enough to capture many types, without loading whole file into prompt
  const header = parseCsvHeader(lines[0] || '')
  const idxFinalType = header.findIndex((h) => /final/i.test(h) && /call/i.test(h) && /type/i.test(h))
  const idxReceived = header.findIndex((h) => /call/i.test(h) && /received/i.test(h))

  const byType = new Map()
  let minDate = null
  let maxDate = null

  for (const ln of lines.slice(1)) {
    const type = idxFinalType >= 0 ? csvValue(ln, idxFinalType) : ''
    if (type) byType.set(type, (byType.get(type) || 0) + 1)

    if (idxReceived >= 0) {
      const raw = csvValue(ln, idxReceived)
      const m = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})/)
      if (m) {
        const d = new Date(`${m[3]}-${m[1]}-${m[2]}T00:00:00Z`)
        if (!Number.isNaN(d.getTime())) {
          if (!minDate || d < minDate) minDate = d
          if (!maxDate || d > maxDate) maxDate = d
        }
      }
    }
  }

  const top = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40)
  const dateRange = minDate && maxDate ? `${minDate.toISOString().slice(0, 10)} to ${maxDate.toISOString().slice(0, 10)} (sampled)` : '(not detected)'

  return [
    '## Phoenix Calls for Service (2026 sample)',
    `- Source file: calls-for-service_2026-calls-for-service_callsforsrvc2026.csv`,
    `- Columns observed: ${header.filter(Boolean).slice(0, 24).join(', ')}${header.length > 24 ? ', …' : ''}`,
    `- Sampled rows: ${Math.max(0, lines.length - 1).toLocaleString()}`,
    `- Date range (from sampled rows): ${dateRange}`,
    idxFinalType >= 0 ? `- Call type column: ${header[idxFinalType]}` : '- Call type column: (not detected)',
    '',
    '### Common call types (frequency in sampled rows)',
    ...top.map(([t, n]) => `- ${t}: ${n.toLocaleString()}`),
    '',
    '### Important note for interpretation',
    '- Counts above are from a sample of the dataset for concept/demo grounding. They are not guaranteed to match the full-year total unless computed over the full file.',
    '',
  ].join('\n')
}

function buildHeatDeathsSummary() {
  const p = path.join(INTERNAL_DATA, 'phoenixHeatDeathsByVillage.json')
  if (!fs.existsSync(p)) {
    return [
      '## Phoenix Heat Deaths (Example data)',
      '- Source: (not present in repo)',
      '',
    ].join('\n')
  }
  const obj = safeParseJson(readText(p)) || {}
  const entries = Object.entries(obj).filter(([, v]) => Number.isFinite(Number(v)))
  entries.sort((a, b) => Number(b[1]) - Number(a[1]))

  return [
    '## Phoenix Heat Deaths (Example data)',
    '- Source file: src/data/phoenixHeatDeathsByVillage.json',
    '- Notes: These are hardcoded example values used for visualization (not an official dataset).',
    ...entries.map(([name, v]) => `- ${name}: ${Number(v)}`),
    '',
  ].join('\n')
}

function buildHomelessnessSyntheticPointsSummary() {
  const p = path.join(INTERNAL_DATA, 'phoenixHomelessnessSyntheticPoints.json')
  if (!fs.existsSync(p)) {
    return [
      '## Phoenix Homelessness Services (Synthetic point locations)',
      '- Source: (not present in repo)',
      '',
    ].join('\n')
  }

  const geo = safeParseJson(readText(p))
  const count = Array.isArray(geo?.features) ? geo.features.length : 0
  const sample = (geo?.features || []).slice(0, 5).map((f) => ({
    service: f?.properties?.service,
    neighborhood: f?.properties?.neighborhood,
  }))

  return [
    '## Phoenix Homelessness Services (Synthetic point locations)',
    '- Source file: src/data/phoenixHomelessnessSyntheticPoints.json',
    `- Total points: ${count}`,
    '- Notes: Points are synthetic (generated for map visualization) and are scattered within Phoenix neighborhood boundaries.',
    '- Sample properties (first 5):',
    ...sample.map((s) => `  - service: ${s.service || '(unknown)'}; neighborhood: ${s.neighborhood || '(unknown)'}`),
    '',
  ].join('\n')
}

async function main() {
  const sections = [
    '# City Intelligence Knowledge Base (Concept Demo)',
    '',
    'This file is generated from the app’s `External Datasets/` folder.',
    'The assistant must answer ONLY using information in this file.',
    '',
    buildVillagesSummary(),
    buildHomelessnessSummary(),
    buildHomelessnessSyntheticPointsSummary(),
    buildCallsForServiceSummary(),
    buildHeatDeathsSummary(),
  ]

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, sections.join('\n'), 'utf-8')
  // eslint-disable-next-line no-console
  console.log(`Wrote ${OUT}`)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})


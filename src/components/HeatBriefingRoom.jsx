import { useMemo } from 'react'
import { BookOpen } from 'lucide-react'
import { buildHeatBriefing } from '../utils/buildHeatBriefing'

function emphasizeBriefingText(text) {
  const s = String(text || '')
  if (!s) return s

  // Highlight: numbers/percents/temps, time windows, districts, severity words, action verbs.
  const pattern =
    /(\bDistrict\s+\d+\b|\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%?\b|\b\d{1,3}(?:\.\d+)?°[CF]\b|\b\d{2}:\d{2}–\d{2}:\d{2}\b|\b(?:Severe|Extreme|Danger|Critical|Elevated|Caution|High urgency|Very high|High)\b|\b(?:Open|Extend|Escalate|Issue|Deploy|Coordinate|Activate|Stage|Alert|Prepare)\b)/g

  const parts = s.split(pattern).filter((p) => p !== '')
  return parts.map((part, idx) => {
    if (!part) return null
    if (pattern.test(part)) {
      // reset lastIndex side-effect for global regex
      pattern.lastIndex = 0
      return (
        <span
          key={`${idx}-${part}`}
          className="font-semibold"
          style={{ color: 'rgba(255,255,255,0.92)' }}
        >
          {part}
        </span>
      )
    }
    pattern.lastIndex = 0
    return <span key={`${idx}-${part}`}>{part}</span>
  })
}

function SectionTitle({ children }) {
  return (
    <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
      {children}
    </p>
  )
}

function BulletList({ items }) {
  if (!items?.length) return null
  return (
    <ul className="text-[12px] leading-snug list-disc pl-4" style={{ color: 'rgba(255,255,255,0.76)' }}>
      {items.map((t, i) => (
        <li key={`${t}-${i}`}>{emphasizeBriefingText(t)}</li>
      ))}
    </ul>
  )
}

/**
 * Props:
 * - input: normalized heat briefing data object
 * - title: optional heading (defaults to "Daily Heat Briefing")
 */
export default function HeatBriefingRoom({ input, title = 'Daily Heat Briefing' }) {
  const briefing = useMemo(() => {
    if (!input) return null
    return buildHeatBriefing(input)
  }, [input])

  const hasContent =
    !!briefing?.topLineSummaries?.length ||
    !!briefing?.keyDevelopments?.length ||
    !!briefing?.decisionRecommendations?.length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4" style={{ color: 'var(--sand-teal)' }} />
        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--color-gray-100)' }}>
          {title}
        </p>
      </div>

      {!hasContent ? (
        <div
          className="rounded-[10px] border px-3 py-2"
          style={{
            borderColor: 'rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <p className="text-[12px] font-semibold" style={{ color: 'var(--color-gray-100)' }}>
            Heat briefing unavailable
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-gray-500)' }}>
            Provide a normalized heat briefing input object to render mayor-ready summaries and recommendations.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <SectionTitle>Summary</SectionTitle>
            <div className="rounded-[8px] border px-2.5 py-2" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <BulletList items={briefing.topLineSummaries} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionTitle>Key developments</SectionTitle>
            <div className="rounded-[8px] border px-2.5 py-2" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <BulletList items={briefing.keyDevelopments} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionTitle>Decision recommendations</SectionTitle>
            <div className="rounded-[8px] border px-2.5 py-2" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
              <BulletList items={briefing.decisionRecommendations} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}


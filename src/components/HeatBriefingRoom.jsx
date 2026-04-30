import { useMemo, useState } from 'react'
import { BookOpen, AlertTriangle, AlertCircle, Info, CheckCircle, ChevronDown } from 'lucide-react'
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

const PRIORITY_CONFIG = {
  critical: {
    border: 'rgba(239,68,68,0.55)',
    bg: 'rgba(239,68,68,0.08)',
    badge: 'rgba(239,68,68,0.18)',
    badgeText: '#fca5a5',
    accent: '#f87171',
    label: 'CRITICAL',
    Icon: AlertTriangle,
  },
  high: {
    border: 'rgba(249,115,22,0.50)',
    bg: 'rgba(249,115,22,0.07)',
    badge: 'rgba(249,115,22,0.18)',
    badgeText: '#fdba74',
    accent: '#fb923c',
    label: 'HIGH',
    Icon: AlertCircle,
  },
  moderate: {
    border: 'rgba(234,179,8,0.45)',
    bg: 'rgba(234,179,8,0.06)',
    badge: 'rgba(234,179,8,0.18)',
    badgeText: '#fde047',
    accent: '#facc15',
    label: 'MODERATE',
    Icon: Info,
  },
  standard: {
    border: 'rgba(148,163,184,0.25)',
    bg: 'rgba(255,255,255,0.03)',
    badge: 'rgba(148,163,184,0.15)',
    badgeText: 'rgba(255,255,255,0.50)',
    accent: 'rgba(255,255,255,0.40)',
    label: 'STANDARD',
    Icon: CheckCircle,
  },
}

function DecisionCard({ priority = 'standard', text }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.standard
  const { Icon } = cfg
  return (
    <div
      className="rounded-[8px] border px-3 py-2.5 flex flex-col gap-1.5"
      style={{ borderColor: cfg.border, background: cfg.bg }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3 flex-shrink-0" style={{ color: cfg.accent }} aria-hidden="true" />
        <span
          className="text-[10px] font-bold tracking-widest uppercase"
          style={{ color: cfg.badgeText }}
        >
          {cfg.label}
        </span>
      </div>
      <p className="text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.82)' }}>
        {emphasizeBriefingText(text)}
      </p>
    </div>
  )
}

function BulletItem({ text }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="w-full text-left flex items-start gap-1.5 rounded-[6px] px-2 py-1.5 transition-colors"
      style={{
        background: expanded ? 'rgba(255,255,255,0.04)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      <ChevronDown
        className="w-3 h-3 mt-0.5 flex-shrink-0 transition-transform"
        style={{
          color: 'rgba(255,255,255,0.35)',
          transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
        }}
        aria-hidden="true"
      />
      <span
        className="text-[12px] leading-snug"
        style={{
          color: 'rgba(255,255,255,0.76)',
          overflow: expanded ? 'visible' : 'hidden',
          display: expanded ? 'block' : '-webkit-box',
          WebkitLineClamp: expanded ? 'unset' : 1,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {emphasizeBriefingText(text)}
      </span>
    </button>
  )
}

function BulletList({ items }) {
  if (!items?.length) return null
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((t, i) => (
        <BulletItem key={`${t}-${i}`} text={t} />
      ))}
    </div>
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
    !!briefing?.structuredRecommendations?.length

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

          {!!briefing.structuredRecommendations?.length && (
            <div className="flex flex-col gap-1.5">
              <SectionTitle>Decision recommendations</SectionTitle>
              <div className="flex flex-col gap-1.5">
                {briefing.structuredRecommendations.map((rec, i) => (
                  <DecisionCard key={i} priority={rec.priority} text={rec.text} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}


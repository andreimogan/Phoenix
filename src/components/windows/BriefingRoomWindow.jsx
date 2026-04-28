import { BookOpen, ChevronDown, Flame, Info } from 'lucide-react'
import { usePanelContext } from '../../contexts/PanelContext'

function SectionTitle({ children }) {
  return (
    <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
      {children}
    </p>
  )
}

function MetricPill({ label, value }) {
  return (
    <div
      className="rounded-[8px] border px-2.5 py-2 weather-overlay-soft-card"
      style={{
        borderColor: 'rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.025)',
      }}
    >
      <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
        {label}
      </p>
      <p className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--color-gray-100)' }}>
        {value}
      </p>
    </div>
  )
}

export default function BriefingRoomWindow() {
  const { rightWindowsCollapsed, toggleRightWindowCollapsed } = usePanelContext()
  const isCollapsed = !!rightWindowsCollapsed?.briefingRoom

  return (
    <div
      className="weather-overlay-shell"
      style={{ width: '360px', pointerEvents: 'auto', maxHeight: '100%' }}
      aria-label="Briefing Room"
    >
      <div
        className="weather-overlay-surface border rounded-[10px] flex flex-col gap-1"
        style={{
          borderColor: 'var(--color-gray-700)',
          minHeight: '30vh',
          maxHeight: 'min(100vh, 100%)',
          height: '100%',
        }}
      >
        <div className="w-full flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" style={{ color: 'var(--sand-teal)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>
              Briefing Room
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md h-7 w-7"
            style={{ color: 'rgba(255,255,255,0.75)' }}
            title={isCollapsed ? 'Expand' : 'Minimize'}
            onClick={() => toggleRightWindowCollapsed('briefingRoom')}
          >
            <ChevronDown
              className="w-4 h-4 transition-transform"
              style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
              aria-hidden="true"
            />
          </button>
        </div>

        {!isCollapsed && (
        <div className="px-3 pb-3 flex-1" style={{ overflowY: 'auto', minHeight: 0 }}>
          <div className="border-t pt-3 flex flex-col gap-3" style={{ borderColor: 'var(--color-gray-700)' }}>
            {/* Briefing 1 */}
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--color-gray-100)' }}>
                    Daily Heat Briefing
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--color-gray-400)' }}>
                    Week of Aug 7, 2025 · Citywide
                  </p>
                </div>
                <div
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold shrink-0"
                  style={{
                    color: '#fca5a5',
                    background: 'rgba(220, 38, 38, 0.12)',
                    borderColor: 'rgba(252, 165, 165, 0.22)',
                  }}
                  title="Elevated heat pressure"
                >
                  <Flame className="w-3.5 h-3.5" />
                  Elevated
                </div>
              </div>

              <p className="text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.72)' }}>
                Heat pressure is elevated this week, with illness activity concentrated in central and west-side districts.
              </p>

              <div className="flex flex-col gap-2">
                <SectionTitle>Key metrics</SectionTitle>
                <div className="grid grid-cols-2 gap-1.5">
                  <MetricPill label="Heat illnesses" value="173" />
                  <MetricPill label="Heat deaths" value="9" />
                  <MetricPill label="Cooling visits" value="3,557" />
                  <MetricPill label="Avg high temperature" value="112°F" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <SectionTitle>Priority areas</SectionTitle>
                <div className="rounded-[8px] border px-2.5 py-2" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <ul className="text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.76)' }}>
                    <li>
                      <span className="font-semibold" style={{ color: 'var(--color-gray-100)' }}>District 7</span>: highest cooling center demand
                    </li>
                    <li>
                      <span className="font-semibold" style={{ color: 'var(--color-gray-100)' }}>District 4</span>: elevated illness burden
                    </li>
                    <li>
                      <span className="font-semibold" style={{ color: 'var(--color-gray-100)' }}>District 1</span>: sustained temperature-driven pressure
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <SectionTitle>Outlook</SectionTitle>
                <div className="rounded-[8px] border px-2.5 py-2" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <p className="text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.76)' }}>
                    Above-normal heat is likely to keep risk elevated through next week.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <SectionTitle>Recommended actions</SectionTitle>
                <div className="rounded-[8px] border px-2.5 py-2" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <ul className="text-[12px] leading-snug list-disc pl-4" style={{ color: 'rgba(255,255,255,0.76)' }}>
                    <li>Prioritize cooling outreach in District 7</li>
                    <li>Monitor severe transports in high-burden districts</li>
                    <li>Prepare public messaging for the next heat peak</li>
                  </ul>
                </div>
              </div>

              <div
                className="flex items-start gap-2 rounded-[8px] border px-2.5 py-2"
                style={{
                  borderColor: 'rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.03)',
                  color: 'rgba(255,255,255,0.78)',
                }}
              >
                <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--color-gray-400)' }} />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--color-gray-200)' }}>
                    Data note
                  </p>
                  <p className="text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,0.68)' }}>
                    Based on weekly reporting and forecast-linked interpretation.
                  </p>
                </div>
              </div>
            </div>

            {/* Briefings 2-5 */}
            {['TBD', 'TBD', 'TBD', 'TBD'].map((label, idx) => (
              <div
                key={`${label}-${idx}`}
                className="rounded-[10px] border px-3 py-2"
                style={{
                  borderColor: 'rgba(255,255,255,0.07)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <p className="text-[12px] font-semibold" style={{ color: 'var(--color-gray-100)' }}>
                  Briefing {idx + 2}: {label}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-gray-500)' }}>
                  Placeholder — connect additional briefings here.
                </p>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  )
}


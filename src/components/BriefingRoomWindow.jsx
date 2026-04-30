import { BookOpen } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { usePanelContext } from '../contexts/PanelContext'
import HeatBriefingRoom from './HeatBriefingRoom'
import { buildPhoenixHeatBriefingInput } from '../utils/phoenixHeatBriefingInput'

export default function BriefingRoomWindow() {
  const { currentView, phoenixBriefingRoomVisible, phoenixWeatherWindowVisible, phoenixLatest311WindowVisible, phoenixInterventionWindowVisible } =
    usePanelContext()
  const [input, setInput] = useState(null)

  const topOffset = useMemo(() => {
    if (phoenixInterventionWindowVisible) return '936px'
    if (phoenixLatest311WindowVisible) return '650px'
    if (phoenixWeatherWindowVisible) return '364px'
    return '84px'
  }, [phoenixInterventionWindowVisible, phoenixLatest311WindowVisible, phoenixWeatherWindowVisible])

  if (!phoenixBriefingRoomVisible) return null
  if (currentView === 'performance') return null

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const next = await buildPhoenixHeatBriefingInput()
        if (!cancelled) setInput(next)
      } catch {
        if (!cancelled) setInput(null)
      }
    }
    run()
    const id = setInterval(run, 10 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <aside
      className="fixed weather-overlay-shell"
      style={{
        top: topOffset,
        right: '16px',
        width: '360px',
        zIndex: 40,
      }}
      aria-label="Briefing Room"
    >
      <div className="weather-overlay-surface border rounded-[10px] flex flex-col gap-1" style={{ borderColor: 'var(--color-gray-700)' }}>
        <div className="w-full flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" style={{ color: 'var(--sand-teal)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>
              Briefing Room
            </span>
          </div>
        </div>

        <div className="px-3 pb-3">
          <div className="border-t pt-3 flex flex-col gap-3" style={{ borderColor: 'var(--color-gray-700)' }}>
            <HeatBriefingRoom input={input} />
          </div>
        </div>
      </div>
    </aside>
  )
}


import { BookOpen, ChevronDown } from 'lucide-react'
import { usePanelContext } from '../../contexts/PanelContext'
import HeatBriefingRoom from '../HeatBriefingRoom'
import { useEffect, useState } from 'react'
import { buildPhoenixHeatBriefingInput } from '../../utils/phoenixHeatBriefingInput'

export default function BriefingRoomWindow() {
  const { rightWindowsCollapsed, toggleRightWindowCollapsed } = usePanelContext()
  const isCollapsed = !!rightWindowsCollapsed?.briefingRoom
  const [input, setInput] = useState(null)

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
            <HeatBriefingRoom input={input} />
          </div>
        </div>
        )}
      </div>
    </div>
  )
}


import { useMemo } from 'react'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import { usePanelContext } from '../../contexts/PanelContext'
import { generatePerformanceModalData } from '../../utils/performanceAnalytics'

const formatRequestTime = (timestamp) => {
  if (!timestamp) return 'Unknown time'
  const date = new Date(timestamp)
  const now = Date.now()
  const diffHours = Math.floor((now - date.getTime()) / (1000 * 60 * 60))

  if (diffHours < 1) return 'Less than 1h ago'
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function ImmediateInterventionWindow() {
  const {
    selectedCity,
    selectedDate,
    baltimore311Data,
    healthOverdoseData,
    setCopilotVisible,
    setActiveTab,
    setChatMessages,
    rightWindowsCollapsed,
    toggleRightWindowCollapsed,
  } = usePanelContext()
  const isCollapsed = !!rightWindowsCollapsed?.intervention

  const immediateIntervention = useMemo(() => {
    if (selectedCity === 'phoenix') {
      return {
        title: 'Urban heat & roadway stress — pilot corridor (placeholder)',
        description:
          'Sample priority narrative only. Connect Phoenix 311 and health datasets to replace this with live recommendations.',
        createdAt: selectedDate,
        locationHint: 'Planning grid · Central Phoenix (illustrative)',
      }
    }
    if (selectedCity !== 'baltimore' || !baltimore311Data) return null
    const perf = generatePerformanceModalData(selectedDate, baltimore311Data, healthOverdoseData)
    if (!perf?.recommendation) return null

    return {
      title: perf.recommendation.title || 'Service Response Acceleration',
      description: perf.recommendation.description || 'Prioritized intervention required.',
      createdAt: selectedDate,
      locationHint: perf?._debug?.topNeighborhoods?.[0]?.name || 'City Priority Zone',
    }
  }, [selectedCity, selectedDate, baltimore311Data, healthOverdoseData])

  const handleAnalyzeImmediateIntervention = () => {
    if (!immediateIntervention) return

    const planMessage = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      type: 'action-plan-context',
      timestamp: new Date(),
      context: {
        title: immediateIntervention.title,
        description: immediateIntervention.description,
        locationHint: immediateIntervention.locationHint,
        steps: [
          { id: 'step-1', text: 'Dispatch priority response crew to highest-impact zone', source: 'recommended' },
          { id: 'step-2', text: 'Validate root cause and isolate affected infrastructure', source: 'recommended' },
          { id: 'step-3', text: 'Coordinate traffic/safety controls for field operations', source: 'recommended' },
          { id: 'step-4', text: 'Issue resident communication and service restoration timeline', source: 'recommended' },
        ],
      },
      removedStepIds: [],
      customSteps: [],
      approvedAction: false,
    }

    setCopilotVisible(true)
    setActiveTab('chat')
    setChatMessages((prev) => [...prev, planMessage])
  }

  return (
    <div className="weather-overlay-shell" style={{ width: '360px', pointerEvents: 'auto' }} aria-label="Immediate Intervention Needed">
      <div className="weather-overlay-surface border rounded-[10px] flex flex-col gap-1" style={{ borderColor: 'var(--color-gray-700)' }}>
        <div className="w-full flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" style={{ color: '#fca5a5' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>
              Immediate Intervention Needed
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md h-7 w-7"
            style={{ color: 'rgba(255,255,255,0.75)' }}
            title={isCollapsed ? 'Expand' : 'Minimize'}
            onClick={() => toggleRightWindowCollapsed('intervention')}
          >
            <ChevronDown
              className="w-4 h-4 transition-transform"
              style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
              aria-hidden="true"
            />
          </button>
        </div>

        {!isCollapsed && (
        <div className="px-3 pb-2">
          <div className="border-t pt-2 flex flex-col gap-1.5" style={{ borderColor: 'var(--color-gray-700)' }}>
            <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
              Priority operational step
            </p>

            {!immediateIntervention && selectedCity !== 'phoenix' && (
              <div
                className="text-xs px-3 py-2 rounded-md border"
                style={{
                  color: 'var(--color-gray-400)',
                  borderColor: 'var(--color-gray-700)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                No immediate intervention recommendation available.
              </div>
            )}

            {immediateIntervention && (
              <div
                className="rounded-[8px] border px-2 py-1.5 weather-overlay-soft-card"
                style={{
                  borderColor: 'var(--color-gray-700)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div
                      className="w-6 h-6 rounded-md border flex items-center justify-center shrink-0"
                      style={{ borderColor: 'rgba(252,165,165,0.35)', background: 'rgba(220,38,38,0.14)' }}
                    >
                      <AlertTriangle className="w-3 h-3" style={{ color: '#fca5a5' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold truncate block text-left max-w-[175px]" style={{ color: 'var(--color-gray-100)' }}>
                        {immediateIntervention.title}
                      </p>
                      <span className="text-[9px] block" style={{ color: 'var(--color-gray-500)' }}>
                        {formatRequestTime(immediateIntervention.createdAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-[10px] underline underline-offset-2"
                    style={{ color: 'var(--sand-teal)' }}
                    onClick={handleAnalyzeImmediateIntervention}
                  >
                    AI Analyze Steps
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  )
}


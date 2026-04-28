import { X, TrendingUp, TrendingDown } from 'lucide-react'
import { useEffect } from 'react'
import { usePanelContext } from '../contexts/PanelContext'

export default function PerformanceDetailModal({ isOpen, onClose, data }) {
  const { createWorkOrder, addSuccessNotification } = usePanelContext()

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen || !data) return null

  const formatNumber = (num) => {
    if (num >= 1000) return `~${(num / 1000).toFixed(0)}k`
    return `~${num}`
  }

  const handleAuthorizeIntervention = () => {
    const serviceTypes = data?._debug?.topTypes?.slice(0, 3) || []
    const neighborhoods = data?._debug?.topNeighborhoods?.slice(0, 3) || []

    const createdOrders = serviceTypes.map((typeItem, index) => {
      const neighborhood = neighborhoods[index % Math.max(1, neighborhoods.length)]?.name || 'City Priority Zone'
      const count = Number(typeItem?.count || 0)
      const impactedEstimate = Math.round((data.residentsImpacted || 0) / Math.max(1, serviceTypes.length))

      return createWorkOrder({
        type: typeItem?.name || data.currentImpact?.summary || 'Service Response Acceleration',
        priority: index === 0 ? 'High' : 'Medium',
        status: 'New',
        location: neighborhood,
        instructions: [
          `Execute ${data.recommendation?.title || 'Service Response Acceleration'} in ${neighborhood}.`,
          `Prioritize ${typeItem?.name || 'critical service requests'} backlog reduction within 24-48 hours.`,
          `Expected impact: resolve ~${count} queued requests and reduce resident exposure for ~${impactedEstimate} people.`,
          'Submit field verification and restoration status by end of shift.',
        ].join(' '),
        actionItems: [
          `Dispatch rapid response crew for ${typeItem?.name || 'priority requests'}`,
          'Complete on-site assessment and confirm scope',
          'Update work order with completion evidence and ETA',
        ],
      })
    })

    if (createdOrders.length > 0) {
      addSuccessNotification(`Created ${createdOrders.length} work orders for service response acceleration.`)
      onClose()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed z-50 rounded-[14px] border shadow-2xl overflow-y-auto overflow-x-hidden"
        style={{
          width: 'min(900px, calc(100vw - 32px))',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          maxHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--sand-surface)', // #1a1d22
          borderColor: 'var(--color-gray-700)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-3 p-4" style={{ width: '100%' }}>
          {/* Header */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between w-full">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--color-gray-100)' }}>
                City Performance & Reliability
              </h2>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border"
                  style={{
                    background: 'rgba(220, 38, 38, 0.15)',
                    borderColor: 'rgba(220, 38, 38, 0.35)',
                    color: '#fca5a5',
                  }}
                >
                  Intervention needed - High priority
                </span>
                <button
                  onClick={onClose}
                  className="p-1 rounded-md transition-colors"
                  style={{ color: 'var(--color-gray-400)' }}
                  onMouseEnter={(e) => { 
                    e.currentTarget.style.color = 'var(--color-gray-100)'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)' 
                  }}
                  onMouseLeave={(e) => { 
                    e.currentTarget.style.color = 'var(--color-gray-400)'
                    e.currentTarget.style.background = 'transparent' 
                  }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="h-px w-full" style={{ background: 'var(--border-subtle)' }} />
          </div>

          {/* Main Metric */}
          <div className="flex items-center justify-center gap-2 py-1">
            <span className="text-4xl font-medium" style={{ color: 'var(--color-gray-100)' }}>
              {formatNumber(data.residentsImpacted)}
            </span>
            <span className="text-lg font-semibold" style={{ color: 'var(--color-gray-400)' }}>
              residents impacted
            </span>
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full"
              style={{ backgroundColor: 'rgba(220, 38, 38, 0.15)' }}
            >
              {data.trendDirection === 'up' ? (
                <TrendingUp className="w-5 h-5" style={{ color: '#fca5a5' }} />
              ) : (
                <TrendingDown className="w-5 h-5" style={{ color: '#34d399' }} />
              )}
            </div>
          </div>

          {/* Sub-metrics Cards */}
          <div className="flex gap-3 py-1">
            <div
              className="flex-1 flex flex-col items-center gap-1.5 p-3 rounded-[14px] border"
              style={{
                backgroundColor: 'var(--sand-dark)', // #0f1216
                borderColor: 'var(--color-gray-700)',
              }}
            >
              <p className="text-base font-medium" style={{ color: 'var(--color-gray-300)' }}>Resolution Time</p>
              <p className="text-[15px] font-normal" style={{ color: 'var(--color-gray-100)' }}>{data.resolutionTimeSLA}</p>
            </div>
            <div
              className="flex-1 flex flex-col items-center gap-1.5 p-3 rounded-[14px] border"
              style={{
                backgroundColor: 'var(--sand-dark)', // #0f1216
                borderColor: 'var(--color-gray-700)',
              }}
            >
              <p className="text-base font-medium" style={{ color: 'var(--color-gray-300)' }}>311 calls</p>
              <div className="flex items-center gap-2">
                {data.trendDirection === 'up' ? (
                  <TrendingUp className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-green-400 rotate-180" />
                )}
                <p className="text-[15px] font-normal" style={{ color: 'var(--color-gray-100)' }}>
                  {data.weekOverWeekPercent}% week-on-week
                </p>
              </div>
            </div>
          </div>

          {/* Alert Box - Situation Overview */}
          <div
            className="flex flex-col p-2.5 rounded-lg border"
            style={{
              backgroundColor: 'rgba(220, 38, 38, 0.15)',
              borderColor: 'rgba(220, 38, 38, 0.3)',
            }}
          >
            <div className="text-sm leading-relaxed" style={{ color: '#fca5a5' }}>
              <p className="font-bold mb-2">
                {formatNumber(data.currentImpact.count)} residents are currently impacted by {data.currentImpact.summary}
              </p>

              <p className="mb-2">
                <span className="font-bold">{formatNumber(data.riskForecast.count)}</span>
                <span className="font-normal"> residents will be exposed in the next 10 days {data.riskForecast.description}.</span>
              </p>

              <p className="font-bold mb-1">311 Signal</p>
              <p className="font-normal mb-1">
                ~{data.signal311.totalCalls} calls ({data.signal311.wowDirection === 'increase' ? '+' : ''}{data.signal311.wowPercent}% WoW);
              </p>
              <p className="font-normal mb-2">
                ~{data.signal311.criticalCount} critical; driven by {data.signal311.topTypes} in {data.signal311.topNeighborhoods}; resolution times {data.signal311.resolutionDelay}.
              </p>

              <p className="font-bold mb-1">Sentiment Signal</p>
              <p className="font-normal">{data.sentimentSignal.trend}</p>
            </div>
          </div>

          {/* Recommended Action */}
          <div className="flex flex-col gap-3 py-1">
            <div className="flex items-center justify-between w-full">
              <p className="text-base font-bold" style={{ color: 'var(--color-gray-100)' }}>
                Recommended Action: <span className="font-normal" style={{ color: 'var(--color-gray-300)' }}>(Critical priority)</span>
              </p>
              <button
                className="px-3 py-1.5 rounded-md border text-xs font-medium transition-colors"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderColor: 'var(--color-gray-700)',
                  color: 'var(--color-gray-200)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)' }}
              >
                See more priority items
              </button>
            </div>

            <div>
              <p className="text-lg font-medium mb-1" style={{ color: 'var(--color-gray-100)' }}>{data.recommendation.title}</p>
              <p className="text-sm font-normal leading-relaxed" style={{ color: 'var(--color-gray-400)' }}>
                {data.recommendation.description}
              </p>
            </div>
          </div>

          <div className="h-px w-full" style={{ background: 'var(--border-subtle)' }} />

          {/* Impact */}
          <div className="flex flex-col gap-2">
            <p className="text-base font-bold" style={{ color: 'var(--color-gray-100)' }}>Impact:</p>
            <p className="text-base font-bold" style={{ color: '#34d399' }}>
              {data.recommendation.impact}
            </p>
          </div>

          <div className="h-px w-full" style={{ background: 'var(--border-subtle)' }} />

          {/* Economic Payoff */}
          <div className="flex flex-col gap-2">
            <p className="text-base font-semibold" style={{ color: 'var(--color-gray-100)' }}>
              Overall Economic Payoff (Aggregate):
            </p>
            <p className="text-base leading-relaxed">
              <span className="font-bold" style={{ color: '#34d399' }}>
                {data.recommendation.economicPayoff.split(' ')[0]} 
              </span>
              <span className="font-normal" style={{ color: 'var(--color-gray-300)' }}>
                {' ' + data.recommendation.economicPayoff.split(' ').slice(1).join(' ')}
              </span>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex gap-3">
              <button
                className="flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--color-gray-200)',
                  border: '1px solid var(--color-gray-700)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)' }}
                onClick={handleAuthorizeIntervention}
              >
                Authorize Intervention
              </button>
              <button
                className="flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                disabled
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--color-gray-200)',
                  border: '1px solid var(--color-gray-700)',
                  opacity: 0.5,
                  cursor: 'not-allowed',
                }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)' }}
                onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)' }}
              >
                Assign to Relevant Division
              </button>
            </div>
            <button
              className="w-full px-4 py-2 rounded-md text-sm font-medium transition-colors border"
              disabled
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--color-gray-200)',
                borderColor: 'var(--color-gray-700)',
                opacity: 0.5,
                cursor: 'not-allowed',
              }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)' }}
              onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)' }}
            >
              View Affected Neighborhoods
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

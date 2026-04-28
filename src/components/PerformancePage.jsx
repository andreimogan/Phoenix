import { AlertTriangle, CheckCircle2, Clock3, Droplets, ShieldAlert, Waves } from 'lucide-react'
import { usePanelContext } from '../contexts/PanelContext'

export default function PerformancePage({ data }) {
  const { setCopilotVisible, setActiveTab, setChatMessages } = usePanelContext()

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-gray-400)' }}>
        <p>No performance data available</p>
      </div>
    )
  }

  const topTypes = data._debug?.topTypes || []
  const topNeighborhoods = data._debug?.topNeighborhoods || []
  const now = new Date()
  const asOfLabel = now.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const formatResidents = (value) => {
    if (value >= 1000) return `~${(value / 1000).toFixed(1)}k`
    return `~${value}`
  }

  const kpis = [
    {
      label: 'Affected Residents',
      value: formatResidents(data.residentsImpacted),
      note: `Estimated currently impacted`,
      accent: '#f97316',
      icon: AlertTriangle,
    },
    {
      label: 'Service Reliability',
      value: `${Math.max(1, 100 - data.weekOverWeekPercent)}%`,
      note: `Target: 95%`,
      accent: '#f59e0b',
      icon: CheckCircle2,
    },
    {
      label: 'Avg Time to Resolution',
      value: data.resolutionTimeSLA.replace('xSLA', 'x SLA'),
      note: `Target: <= 1x SLA`,
      accent: '#22c55e',
      icon: Clock3,
    },
    {
      label: 'Successful Call-outs',
      value: `${Math.max(0, 100 - Math.round(data.signal311.wowPercent / 2))}%`,
      note: `Target: 90%`,
      accent: '#facc15',
      icon: CheckCircle2,
    },
    {
      label: 'Non-Revenue Water',
      value: `${Math.min(40, 12 + Math.round(data.signal311.criticalCount / 2))}%`,
      note: `Target: 18%`,
      accent: '#f43f5e',
      icon: Waves,
    },
    {
      label: 'Avg Open Requests / Zone',
      value: `${Math.max(1, Math.round((data._debug?.openRequestsCount || 0) / 12))}`,
      note: `As of ${asOfLabel}`,
      accent: '#60a5fa',
      icon: Droplets,
    },
  ]

  const attentionRows = [
    {
      item: `${data.currentImpact.summary}`,
      type: 'Active Event',
      detail: `${data.signal311.criticalCount} critical requests above 7 days open`,
    },
    ...(topNeighborhoods.slice(0, 2).map((n) => ({
      item: `${n.name} - elevated service load`,
      type: 'Early Warning',
      detail: `${n.count} open requests concentrated in neighborhood`,
    }))),
    ...(topTypes.slice(0, 3).map((t) => ({
      item: t.name,
      type: 'Operations Watch',
      detail: `${t.count} open items · prioritize 24-48h response`,
    }))),
  ].slice(0, 6)

  const scheduleRows = [
    { time: '06:00-08:00', activity: 'Valve Operation Check', location: topNeighborhoods[0]?.name || 'North Sector', status: 'On-track' },
    { time: '08:00-12:00', activity: 'Crew Dispatch Window', location: topNeighborhoods[1]?.name || 'East Sector', status: 'In progress' },
    { time: '09:00', activity: 'Daily Ops Briefing', location: 'Control Room', status: 'Complete' },
    { time: '12:00-14:00', activity: 'Priority Work Orders', location: topNeighborhoods[2]?.name || 'West Sector', status: 'Active' },
    { time: '14:00-17:00', activity: 'Catchment Review', location: 'Hydrology Desk', status: 'Planned' },
  ]

  const openAnalyzeStepsPlan = ({ title, description, locationHint, steps }) => {
    const defaultSteps = steps && steps.length > 0
      ? steps
      : [
          'Dispatch priority response crew to highest-impact zone',
          'Validate root cause and isolate affected infrastructure',
          'Coordinate traffic/safety controls for field operations',
          'Issue resident communication and service restoration timeline',
        ]

    const planMessage = {
      id: Date.now(),
      type: 'action-plan-context',
      timestamp: new Date(),
      context: {
        title: title || 'AI Enhanced Recommended Action',
        description: description || 'Analyze and execute recommended response plan.',
        economicPayoff: data.recommendation?.economicPayoff || '',
        locationHint: locationHint || data._debug?.topNeighborhoods?.[0]?.name || 'City Priority Zone',
        steps: defaultSteps.map((text, idx) => ({ id: `step-${idx + 1}`, text, source: 'recommended' })),
      },
      removedStepIds: [],
      customSteps: [],
      approvedAction: false,
    }

    setCopilotVisible(true)
    setActiveTab('chat')
    setChatMessages((prev) => [...prev, planMessage])
  }

  const handleAnalyzeSteps = () => {
    const defaultSteps = [
      'Dispatch priority response crew to highest-impact zone',
      'Validate root cause and isolate affected infrastructure',
      'Coordinate traffic/safety controls for field operations',
      'Issue resident communication and service restoration timeline',
    ]

    openAnalyzeStepsPlan({
      title: data.recommendation?.title || 'AI Enhanced Recommended Action',
      description: data.recommendation?.description || 'Analyze and execute recommended response plan.',
      locationHint: data._debug?.topNeighborhoods?.[0]?.name || 'City Priority Zone',
      steps: defaultSteps,
    })
  }

  return (
    <div
      className="overflow-y-auto"
      style={{
        backgroundColor: 'var(--content-bg)',
        marginLeft: '80px',
        marginTop: 'calc(var(--nav-height) + 16px)',
        height: 'calc(100vh - var(--nav-height) - 16px)',
      }}
    >
      <div className="w-full px-8 py-6">
        <div className="mb-5">
          <p className="text-2xl font-bold mb-1" style={{ color: 'var(--color-gray-100)' }}>
            City Performance & Reliability
          </p>
        </div>

        <div className="grid grid-cols-6 gap-3 mb-6">
          {kpis.map((kpi) => {
            const Icon = kpi.icon
            return (
              <div
                key={kpi.label}
                className="rounded-[10px] border px-3 py-2.5"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  borderColor: 'var(--color-gray-700)',
                }}
              >
                <div className="h-1 w-8 rounded-full mb-2" style={{ background: kpi.accent, opacity: 0.9 }} />
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3.5 h-3.5" style={{ color: 'var(--color-gray-400)' }} />
                  <p className="text-[10px] uppercase tracking-wide truncate" style={{ color: 'var(--color-gray-500)' }}>
                    {kpi.label}
                  </p>
                </div>
                <p className="text-2xl font-bold leading-none mb-1" style={{ color: 'var(--color-gray-100)' }}>
                  {kpi.value}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--color-gray-500)' }}>
                  {kpi.note}
                </p>
              </div>
            )
          })}
        </div>

        <div className="mt-5 mb-5 rounded-[10px] border px-4 py-3 flex items-start gap-2.5" style={{ borderColor: 'rgba(220,38,38,0.32)', background: 'rgba(220,38,38,0.08)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5" style={{ color: '#fca5a5' }} />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#fca5a5' }}>
              AI Enhanced Recommended Action
            </p>
            <p className="text-sm" style={{ color: 'var(--color-gray-200)' }}>
              {data.recommendation.title} - {data.recommendation.description}
            </p>
          </div>
          <button
            className="px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors"
            style={{
              borderColor: 'rgba(96,165,250,0.45)',
              backgroundColor: 'rgba(59,130,246,0.16)',
              color: '#93c5fd',
            }}
            onClick={handleAnalyzeSteps}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.25)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.16)' }}
          >
            Analyze Steps
          </button>
        </div>

        <div className="rounded-[10px] border mb-5 overflow-hidden" style={{ borderColor: 'var(--color-gray-700)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: 'var(--color-gray-700)' }}>
            <ShieldAlert className="w-4 h-4" style={{ color: '#fca5a5' }} />
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-gray-200)' }}>
              Needs Attention
            </p>
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded" style={{ color: '#fca5a5', background: 'rgba(220,38,38,0.14)' }}>
              {attentionRows.length} items
            </span>
          </div>
          <div
            className="grid px-4 py-2 text-[10px] uppercase tracking-wide border-b"
            style={{
              borderColor: 'var(--color-gray-700)',
              color: 'var(--color-gray-500)',
              gridTemplateColumns: '40px minmax(260px,2.4fr) minmax(150px,1.2fr) minmax(360px,2.8fr) minmax(160px,1.1fr)',
            }}
          >
            <span>#</span>
            <span>Item</span>
            <span>Type</span>
            <span>Detail</span>
            <span>Actions</span>
          </div>
          {attentionRows.map((row, index) => (
            <div
              key={`${row.item}-${index}`}
              className="grid px-4 py-2 border-b text-xs items-center"
              style={{
                borderColor: index === attentionRows.length - 1 ? 'transparent' : 'var(--color-gray-700)',
                gridTemplateColumns: '40px minmax(260px,2.4fr) minmax(150px,1.2fr) minmax(360px,2.8fr) minmax(160px,1.1fr)',
              }}
            >
              <span className="pr-2" style={{ color: 'var(--color-gray-500)' }}>{index + 1}</span>
              <span className="truncate pr-3 min-w-0" style={{ color: 'var(--color-gray-100)' }}>{row.item}</span>
              <span className="truncate pr-2 min-w-0" style={{ color: 'var(--color-gray-300)' }}>{row.type}</span>
              <span className="truncate pr-3 min-w-0" style={{ color: 'var(--color-gray-500)' }}>{row.detail}</span>
              <span className="min-w-0">
                <button
                  type="button"
                  className="text-[11px] underline underline-offset-2"
                  style={{ color: 'var(--sand-teal)' }}
                  onClick={() =>
                    openAnalyzeStepsPlan({
                      title: `Action Plan: ${row.item}`,
                      description: `${row.type} - ${row.detail}`,
                      locationHint: row.item.split(' - ')[0] || 'City Priority Zone',
                      steps: [
                        `Assign lead team for: ${row.item}`,
                        `Validate field scope and urgency for ${row.type.toLowerCase()} case`,
                        `Coordinate response sequencing based on: ${row.detail}`,
                        'Publish execution update and monitor SLA progress',
                      ],
                    })
                  }
                >
                  AI Analyze Steps
                </button>
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-[10px] border overflow-hidden" style={{ borderColor: 'var(--color-gray-700)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: 'var(--color-gray-700)' }}>
            <Clock3 className="w-4 h-4" style={{ color: 'var(--color-gray-400)' }} />
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-gray-200)' }}>
              Today&apos;s Schedule
            </p>
          </div>
          <div className="grid grid-cols-12 px-4 py-2 text-[10px] uppercase tracking-wide border-b" style={{ borderColor: 'var(--color-gray-700)', color: 'var(--color-gray-500)' }}>
            <span className="col-span-2">Time</span>
            <span className="col-span-4">Activity</span>
            <span className="col-span-3">Location</span>
            <span className="col-span-3">Status</span>
          </div>
          {scheduleRows.map((row, index) => (
            <div
              key={`${row.time}-${row.activity}-${index}`}
              className="grid grid-cols-12 px-4 py-2 border-b text-xs"
              style={{ borderColor: index === scheduleRows.length - 1 ? 'transparent' : 'var(--color-gray-700)' }}
            >
              <span className="col-span-2" style={{ color: 'var(--color-gray-300)' }}>{row.time}</span>
              <span className="col-span-4" style={{ color: 'var(--color-gray-100)' }}>{row.activity}</span>
              <span className="col-span-3 truncate pr-2" style={{ color: 'var(--color-gray-400)' }}>{row.location}</span>
              <span className="col-span-3" style={{ color: 'var(--color-gray-500)' }}>{row.status}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

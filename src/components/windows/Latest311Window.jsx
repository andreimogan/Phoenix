import { useMemo } from 'react'
import { Building2, Bug, Car, ChevronDown, Circle, Droplets, Eye, Home, Shield, Trash2, Trees, Wrench } from 'lucide-react'
import { usePanelContext } from '../../contexts/PanelContext'
import { categorizeSRType } from '../../utils/311TypeBuckets'

/** UI-only samples when Phoenix 311 is not connected */
const PHOENIX_PLACEHOLDER_311_ROWS = [
  { id: 'phx-1', srType: 'Streetlight outage (sample)', timeLabel: 'Sample · no live feed' },
  { id: 'phx-2', srType: 'Alley bulk pickup (sample)', timeLabel: 'Sample · no live feed' },
  { id: 'phx-3', srType: 'Hydrant inspection (sample)', timeLabel: 'Sample · no live feed' },
]

const getBucketIcon = (bucketId) => {
  switch (bucketId) {
    case 'sanitation':
      return Trash2
    case 'housing':
      return Home
    case 'streets':
      return Wrench
    case 'water':
      return Droplets
    case 'parks':
      return Trees
    case 'animals':
      return Bug
    case 'vehicles':
      return Car
    case 'safety':
      return Shield
    case 'facilities':
      return Building2
    default:
      return Circle
  }
}

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

export default function Latest311Window() {
  const {
    selectedCity,
    selectedDate,
    baltimore311Data,
    setCurrentView,
    requestMapFocus,
    requestMapPopup,
    setCopilotVisible,
    setActiveTab,
    setChatMessages,
    rightWindowsCollapsed,
    toggleRightWindowCollapsed,
  } = usePanelContext()
  const isCollapsed = !!rightWindowsCollapsed?.latest311

  const latestOpenRequests = useMemo(() => {
    if (!baltimore311Data?.features?.length || selectedCity !== 'baltimore') return []

    const asOf = new Date(selectedDate)
    asOf.setHours(23, 59, 59, 999)
    const asOfTime = asOf.getTime()

    return baltimore311Data.features
      .filter((feature) => {
        const created = feature?.properties?.CreatedDate
        const closed = feature?.properties?.CloseDate
        if (!created || created > asOfTime) return false
        return !closed || closed > asOfTime
      })
      .sort((a, b) => (b?.properties?.CreatedDate || 0) - (a?.properties?.CreatedDate || 0))
      .slice(0, 5)
  }, [baltimore311Data, selectedCity, selectedDate])

  const handleAnalyze311Request = (request) => {
    const props = request?.properties || {}
    const srType = props.SRType || 'Service Request'
    const locationHint = props.Neighborhood || props.Address || 'City Priority Zone'
    const detail = props.SRStatus ? `Status: ${props.SRStatus}` : 'Open 311 request requires triage.'

    const planMessage = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      type: 'action-plan-context',
      timestamp: new Date(),
      context: {
        title: `311 Response Plan: ${srType}`,
        description: `${detail} ${props.Agency ? `Agency: ${props.Agency}.` : ''}`.trim(),
        locationHint,
        workOrderStrategy: 'single',
        steps: [
          { id: 'step-1', text: `Assign initial triage owner for ${srType}`, source: 'recommended' },
          { id: 'step-2', text: `Validate on-site conditions at ${locationHint}`, source: 'recommended' },
          { id: 'step-3', text: 'Define response scope, crew, and equipment', source: 'recommended' },
          { id: 'step-4', text: 'Publish ETA and monitor closure progress', source: 'recommended' },
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

  const handleGoToRequestOnMap = (request) => {
    const coords = request?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) return

    const props = request?.properties || {}
    const lng = coords[0]
    const lat = coords[1]

    setCurrentView('map')
    requestMapFocus({ lng, lat, zoom: 15 })
    requestMapPopup({
      lng,
      lat,
      properties: {
        SRType: props.SRType || 'Service Request',
        Address: props.Address || '',
        SRStatus: props.SRStatus || '',
        CreatedDate: props.CreatedDate || null,
        CloseDate: props.CloseDate || null,
        Agency: props.Agency || '',
        Neighborhood: props.Neighborhood || '',
      },
    })
  }

  return (
    <div className="weather-overlay-shell" style={{ width: '360px', pointerEvents: 'auto' }} aria-label="Latest 311 Service Requests">
      <div className="weather-overlay-surface border rounded-[10px] flex flex-col gap-1" style={{ borderColor: 'var(--color-gray-700)' }}>
        <div className="w-full flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4" style={{ color: '#4cc9ff' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>
              Latest 311 Service Requests
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md h-7 w-7"
            style={{ color: 'rgba(255,255,255,0.75)' }}
            title={isCollapsed ? 'Expand' : 'Minimize'}
            onClick={() => toggleRightWindowCollapsed('latest311')}
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
              Latest 5 open 311 requests
            </p>

            {selectedCity !== 'baltimore' && selectedCity !== 'phoenix' && (
              <div
                className="text-xs px-3 py-2 rounded-md border"
                style={{
                  color: 'var(--color-gray-400)',
                  borderColor: 'var(--color-gray-700)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                311 request feed is currently configured for Baltimore dataset.
              </div>
            )}

            {selectedCity === 'phoenix' && (
              <>
                <p className="text-[11px] mb-1.5" style={{ color: 'var(--color-gray-500)' }}>
                  Illustrative rows only — Phoenix 311 is not connected yet.
                </p>
                {PHOENIX_PLACEHOLDER_311_ROWS.map((row) => (
                  <div
                    key={row.id}
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
                          style={{ borderColor: 'rgba(76, 201, 255, 0.2)', background: 'rgba(76, 201, 255, 0.08)' }}
                        >
                          <Eye className="w-3 h-3" style={{ color: 'var(--color-gray-500)' }} />
                        </div>
                        <div className="min-w-0">
                          <span
                            className="text-[11px] font-semibold truncate block text-left max-w-[175px]"
                            style={{ color: 'var(--color-gray-400)' }}
                          >
                            {row.srType}
                          </span>
                          <span className="text-[9px] block" style={{ color: 'var(--color-gray-500)' }}>
                            {row.timeLabel}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--color-gray-600)' }}>
                        Preview
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}

            {selectedCity === 'baltimore' && latestOpenRequests.length === 0 && (
              <div
                className="text-xs px-3 py-2 rounded-md border"
                style={{
                  color: 'var(--color-gray-400)',
                  borderColor: 'var(--color-gray-700)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                No open requests available for the selected date.
              </div>
            )}

            {selectedCity === 'baltimore' &&
              latestOpenRequests.map((request, index) => {
                const srType = request?.properties?.SRType || 'Service Request'
                const created = request?.properties?.CreatedDate
                const bucketId = categorizeSRType(srType)
                const BucketIcon = getBucketIcon(bucketId)

                return (
                  <div
                    key={`${srType}-${created || index}`}
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
                          style={{ borderColor: 'rgba(76, 201, 255, 0.28)', background: 'rgba(76, 201, 255, 0.12)' }}
                        >
                          <BucketIcon className="w-3 h-3" style={{ color: '#4cc9ff' }} />
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="text-[11px] font-semibold truncate block text-left underline-offset-2 max-w-[175px]"
                            style={{ color: 'var(--color-gray-100)' }}
                            onClick={() => handleGoToRequestOnMap(request)}
                            title="Go to map"
                          >
                            {srType}
                          </button>
                          <span className="text-[9px] block" style={{ color: 'var(--color-gray-500)' }}>
                            {formatRequestTime(created)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-[10px] underline underline-offset-2"
                        style={{ color: 'var(--sand-teal)' }}
                        onClick={() => handleAnalyze311Request(request)}
                      >
                        AI Analyze Steps
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
        )}
      </div>
    </div>
  )
}


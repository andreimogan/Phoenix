import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Clock3, ListChecks, Square } from 'lucide-react'
import { usePanelContext } from '../contexts/PanelContext'

const STATUS_STYLES = {
  New: { bg: 'var(--color-blue-600)', text: 'var(--color-white)' },
  Assigned: { bg: 'var(--color-purple-600)', text: 'var(--color-white)' },
  'In Progress': { bg: 'var(--color-orange-600)', text: 'var(--color-white)' },
  Completed: { bg: 'var(--color-green-600)', text: 'var(--color-white)' },
  Cancelled: { bg: 'var(--color-gray-600)', text: 'var(--color-white)' },
}

const PRIORITY_STYLES = {
  High: { bg: 'var(--color-red-600)', text: 'var(--color-white)' },
  Medium: { bg: 'var(--color-orange-500)', text: 'var(--color-white)' },
  Low: { bg: 'var(--color-yellow-600)', text: 'var(--color-white)' },
}

function formatDateTime(input) {
  if (!input) return '-'
  const date = typeof input === 'number' ? new Date(input) : new Date(input)
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function Badge({ label, styleMap }) {
  const style = styleMap[label] || { bg: 'var(--color-gray-600)', text: 'var(--color-white)' }
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: style.bg, color: style.text }}>
      {label}
    </span>
  )
}

export default function WorkOrdersPage() {
  const { workOrders, baltimore311Data, selectedDate, setCurrentView, requestMapFocus, requestMapPopup } = usePanelContext()
  const [expandedId, setExpandedId] = useState(null)
  const [actionStates, setActionStates] = useState({})

  const fallbackOrders = useMemo(() => {
    if (!baltimore311Data?.features?.length) return []

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
      .slice(0, 8)
      .map((feature, idx) => ({
        id: `WO-DEMO-${idx + 1}`,
        type: feature?.properties?.SRType || 'Service Request',
        priority: idx < 2 ? 'High' : idx < 5 ? 'Medium' : 'Low',
        status: idx < 2 ? 'New' : idx < 5 ? 'Assigned' : 'In Progress',
        location: feature?.properties?.Neighborhood || feature?.properties?.Address || 'Unknown location',
        createdAt: feature?.properties?.CreatedDate,
        instructions: 'Dispatch crew, verify root cause, and update status after first field assessment.',
        mapLocation: Array.isArray(feature?.geometry?.coordinates) ? {
          lng: feature.geometry.coordinates[0],
          lat: feature.geometry.coordinates[1],
        } : null,
        mapPopupProperties: {
          SRType: feature?.properties?.SRType || 'Service Request',
          Address: feature?.properties?.Address || '',
          SRStatus: feature?.properties?.SRStatus || '',
          CreatedDate: feature?.properties?.CreatedDate || null,
          CloseDate: feature?.properties?.CloseDate || null,
          Agency: feature?.properties?.Agency || '',
          Neighborhood: feature?.properties?.Neighborhood || '',
        },
      }))
  }, [baltimore311Data, selectedDate])

  const rows = useMemo(() => {
    if (!fallbackOrders.length) return workOrders
    if (!workOrders.length) return fallbackOrders

    const existingIds = new Set(workOrders.map((wo) => wo.id))
    const remainingFallback = fallbackOrders.filter((wo) => !existingIds.has(wo.id))
    return [...workOrders, ...remainingFallback]
  }, [workOrders, fallbackOrders])

  const hydratedRows = useMemo(() => {
    const features = baltimore311Data?.features || []
    if (!features.length) return rows

    const asOf = new Date(selectedDate)
    asOf.setHours(23, 59, 59, 999)
    const asOfTime = asOf.getTime()

    const isOpenAsOf = (feature) => {
      const created = feature?.properties?.CreatedDate
      const closed = feature?.properties?.CloseDate
      if (!created || created > asOfTime) return false
      return !closed || closed > asOfTime
    }

    const openFeatures = features.filter(isOpenAsOf)

    const toLower = (value) => String(value || '').trim().toLowerCase()

    const resolveFeatureFrom = (sourceFeatures, row) => {
      const locationKey = toLower(row.location)
      if (!locationKey) return null

      const exactNeighborhood = sourceFeatures.find((feature) =>
        toLower(feature?.properties?.Neighborhood) === locationKey
      )
      if (exactNeighborhood) return exactNeighborhood

      const partialNeighborhood = sourceFeatures.find((feature) =>
        toLower(feature?.properties?.Neighborhood).includes(locationKey) ||
        locationKey.includes(toLower(feature?.properties?.Neighborhood))
      )
      if (partialNeighborhood) return partialNeighborhood

      const partialAddress = sourceFeatures.find((feature) =>
        toLower(feature?.properties?.Address).includes(locationKey) ||
        locationKey.includes(toLower(feature?.properties?.Address))
      )
      if (partialAddress) return partialAddress

      return null
    }

    return rows.map((row) => {
      if (row.mapLocation?.lng && row.mapLocation?.lat) return row

      // Prefer open requests first, fallback to any historical match if none found
      const feature = resolveFeatureFrom(openFeatures, row) || resolveFeatureFrom(features, row)
      const coords = feature?.geometry?.coordinates
      if (!Array.isArray(coords) || coords.length < 2) return row

      return {
        ...row,
        mapLocation: { lng: coords[0], lat: coords[1] },
        mapPopupProperties: row.mapPopupProperties || {
          SRType: feature?.properties?.SRType || row.type || 'Service Request',
          Address: feature?.properties?.Address || row.location || '',
          SRStatus: feature?.properties?.SRStatus || row.status || '',
          CreatedDate: feature?.properties?.CreatedDate || row.createdAt || null,
          CloseDate: feature?.properties?.CloseDate || row.closedAt || null,
          Agency: feature?.properties?.Agency || row.agency || '',
          Neighborhood: feature?.properties?.Neighborhood || row.location || '',
        },
      }
    })
  }, [rows, baltimore311Data, selectedDate])

  const getActionItems = (row) => {
    if (Array.isArray(row.actionItems) && row.actionItems.length > 0) return row.actionItems

    return [
      'Dispatch crew to site',
      'Perform field verification',
      'Submit status update and next action',
    ]
  }

  const getActionStateForRow = (rowId, actionsLength) => {
    const current = actionStates[rowId]
    if (current && current.length === actionsLength) return current
    return Array(actionsLength).fill(false)
  }

  const toggleAction = (rowId, actionIndex, actionsLength) => {
    setActionStates((prev) => {
      const current = prev[rowId] && prev[rowId].length === actionsLength
        ? [...prev[rowId]]
        : Array(actionsLength).fill(false)
      current[actionIndex] = !current[actionIndex]
      return { ...prev, [rowId]: current }
    })
  }

  const stats = useMemo(() => {
    return {
      total: hydratedRows.length,
      newOrders: hydratedRows.filter((wo) => wo.status === 'New').length,
      inProgress: hydratedRows.filter((wo) => wo.status === 'In Progress' || wo.status === 'Assigned').length,
      completed: hydratedRows.filter((wo) => wo.status === 'Completed').length,
    }
  }, [hydratedRows])

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
            Work Orders
          </p>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
            Field Work Management
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Orders', value: stats.total, color: 'var(--sand-teal)' },
            { label: 'New', value: stats.newOrders, color: 'var(--color-blue-400)' },
            { label: 'In Progress', value: stats.inProgress, color: 'var(--color-orange-400)' },
            { label: 'Completed', value: stats.completed, color: 'var(--color-green-400)' },
          ].map((metric) => (
            <div key={metric.label} className="rounded-[10px] border px-3 py-2.5" style={{ borderColor: 'var(--color-gray-700)', background: 'rgba(255,255,255,0.02)' }}>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--color-gray-500)' }}>{metric.label}</p>
              <p className="text-2xl font-bold leading-none" style={{ color: metric.color }}>{metric.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[10px] border overflow-hidden" style={{ borderColor: 'var(--color-gray-700)', background: 'rgba(255,255,255,0.02)' }}>
          <div
            className="grid px-4 py-2 text-[10px] uppercase tracking-wide border-b"
            style={{
              borderColor: 'var(--color-gray-700)',
              color: 'var(--color-gray-500)',
              gridTemplateColumns: '40px minmax(120px,1.2fr) minmax(180px,1.8fr) minmax(85px,0.8fr) minmax(120px,1fr) minmax(110px,1fr) minmax(170px,1.5fr) minmax(110px,0.9fr)',
            }}
          >
            <span> </span>
            <span>Work Order ID</span>
            <span>Type</span>
            <span>Priority</span>
            <span>Status</span>
            <span>Created</span>
            <span>Location</span>
            <span>Actions</span>
          </div>

          {hydratedRows.length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--color-gray-400)' }}>
              <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No work orders yet</p>
            </div>
          ) : (
            hydratedRows.map((row, index) => {
              const expanded = expandedId === row.id
              return (
                <div key={row.id} className="border-b" style={{ borderColor: index === hydratedRows.length - 1 ? 'transparent' : 'var(--color-gray-700)' }}>
                  <div
                    className="grid px-4 py-2 text-xs items-center"
                    style={{
                      gridTemplateColumns: '40px minmax(120px,1.2fr) minmax(180px,1.8fr) minmax(85px,0.8fr) minmax(120px,1fr) minmax(110px,1fr) minmax(170px,1.5fr) minmax(110px,0.9fr)',
                    }}
                  >
                    <button
                      className="w-6 h-6 rounded flex items-center justify-center"
                      style={{ color: 'var(--color-gray-400)', background: 'rgba(255,255,255,0.03)' }}
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                    >
                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <span className="font-mono font-semibold truncate pr-2 min-w-0" style={{ color: 'var(--sand-teal)' }}>{row.id}</span>
                    <span className="truncate pr-2 min-w-0" style={{ color: 'var(--color-gray-200)' }}>{row.type}</span>
                    <span className="min-w-0"><Badge label={row.priority || 'Medium'} styleMap={PRIORITY_STYLES} /></span>
                    <span className="min-w-0"><Badge label={row.status || 'New'} styleMap={STATUS_STYLES} /></span>
                    <span className="truncate min-w-0" style={{ color: 'var(--color-gray-400)' }}>{formatDateTime(row.createdAt)}</span>
                    <span className="truncate pl-2 min-w-0" style={{ color: 'var(--color-gray-400)' }}>{row.location || '-'}</span>
                    <span className="pl-2 min-w-0">
                      <button
                        type="button"
                        className="text-[11px] underline underline-offset-2"
                        style={{
                          color: row.mapLocation?.lng && row.mapLocation?.lat ? 'var(--sand-teal)' : 'var(--color-gray-500)',
                          cursor: row.mapLocation?.lng && row.mapLocation?.lat ? 'pointer' : 'not-allowed',
                        }}
                        disabled={!row.mapLocation?.lng || !row.mapLocation?.lat}
                        onClick={() => {
                          if (!row.mapLocation?.lng || !row.mapLocation?.lat) return
                          setCurrentView('map')
                          requestMapFocus({ lng: row.mapLocation.lng, lat: row.mapLocation.lat, zoom: 15 })
                          requestMapPopup({
                            lng: row.mapLocation.lng,
                            lat: row.mapLocation.lat,
                            properties: row.mapPopupProperties || {
                              SRType: row.type || 'Service Request',
                              Address: row.location || '',
                              SRStatus: row.status || '',
                              CreatedDate: row.createdAt || null,
                              CloseDate: row.closedAt || null,
                              Agency: row.agency || '',
                              Neighborhood: row.location || '',
                            },
                          })
                        }}
                      >
                        Go To Map
                      </button>
                    </span>
                  </div>

                  {expanded && (
                    <div className="px-4 pb-3 pt-1 text-xs border-t" style={{ borderColor: 'var(--color-gray-700)', background: 'rgba(255,255,255,0.02)' }}>
                      <div className="flex items-center gap-1.5 mb-1.5" style={{ color: 'var(--color-gray-300)' }}>
                        <ListChecks className="w-3.5 h-3.5" />
                        <span className="uppercase tracking-wide text-[10px]">Instructions</span>
                      </div>
                      <p style={{ color: 'var(--color-gray-400)' }}>
                        {row.instructions || 'No detailed instructions provided yet.'}
                      </p>

                      <div className="mt-3">
                        <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--color-gray-500)' }}>
                          Progress Steps
                        </p>
                        <div className="space-y-1.5">
                          {(() => {
                            const actionItems = getActionItems(row)
                            const currentState = getActionStateForRow(row.id, actionItems.length)
                            const completedCount = currentState.filter(Boolean).length
                            const percent = actionItems.length > 0 ? Math.round((completedCount / actionItems.length) * 100) : 0

                            return (
                              <>
                                {actionItems.map((actionText, idx) => (
                                  <button
                                    key={`${row.id}-action-${idx}`}
                                    type="button"
                                    onClick={() => toggleAction(row.id, idx, actionItems.length)}
                                    className="w-full flex items-start gap-2 text-left px-2 py-1.5 rounded border"
                                    style={{
                                      borderColor: 'var(--color-gray-700)',
                                      background: currentState[idx] ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.01)',
                                      color: currentState[idx] ? 'var(--color-gray-200)' : 'var(--color-gray-300)',
                                    }}
                                  >
                                    {currentState[idx] ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-400" />
                                    ) : (
                                      <Square className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--color-gray-500)' }} />
                                    )}
                                    <span className="text-[11px]">{actionText}</span>
                                  </button>
                                ))}

                                <div className="mt-2 px-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
                                      Completion
                                    </span>
                                    <span className="text-[10px] font-semibold" style={{ color: 'var(--sand-teal)' }}>
                                      {completedCount}/{actionItems.length} ({percent}%)
                                    </span>
                                  </div>
                                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                    <div
                                      className="h-full transition-all"
                                      style={{
                                        width: `${percent}%`,
                                        background: 'var(--sand-teal)',
                                      }}
                                    />
                                  </div>
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--color-gray-500)' }}>
                        <Clock3 className="w-3 h-3" />
                        <span>Last update: {formatDateTime(row.updatedAt || row.createdAt)}</span>
                        {row.status === 'Completed' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

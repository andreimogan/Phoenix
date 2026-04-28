import { useState } from 'react'
import { ChevronRight, AlertTriangle } from 'lucide-react'
import AlertCard from './AlertCard'
import { usePanelContext } from '../contexts/PanelContext'

export default function AlertsPanel() {
  const { 
    activeActionTab, 
    setActiveActionTab, 
    actionTabAnchor,
    neighborhoodAlerts,
    setCurrentView 
  } = usePanelContext()
  
  const [dismissedAlerts, setDismissedAlerts] = useState([])
  const [expandedSections, setExpandedSections] = useState({ 
    critical: true, 
    warning: true, 
    medium: false, 
    low: false 
  })

  const isOpen = activeActionTab === 'alerts'
  const panelWidth = 380
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900
  const viewportPadding = 16

  const desiredLeft = actionTabAnchor ? actionTabAnchor.left : viewportWidth - panelWidth - viewportPadding
  const panelLeft = Math.min(
    Math.max(desiredLeft, viewportPadding),
    viewportWidth - panelWidth - viewportPadding
  )
  const desiredTop = actionTabAnchor ? actionTabAnchor.bottom + 8 : 76
  const panelTop = Math.min(
    Math.max(desiredTop, viewportPadding),
    viewportHeight - 220
  )
  const panelMaxHeight = Math.max(200, viewportHeight - panelTop - viewportPadding)

  if (!neighborhoodAlerts) return null

  const handleCloseAlert = (alertId) => {
    setDismissedAlerts(prev => [...prev, alertId])
  }

  const handleViewSite = (alert) => {
    // TODO: Implement zoom to neighborhood on map or highlight on chart
    console.log('View site:', alert.name)
    setCurrentView('map')
    // Could add logic to zoom map to neighborhood coordinates
  }

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const filterDismissed = (alerts) => {
    return alerts?.filter(alert => !dismissedAlerts.includes(alert.id)) || []
  }

  // Get all alerts and combine them
  const criticalAlerts = filterDismissed(neighborhoodAlerts.critical)
  const warningAlerts = filterDismissed(neighborhoodAlerts.warning)
  const mediumAlerts = filterDismissed(neighborhoodAlerts.medium)
  const lowAlerts = filterDismissed(neighborhoodAlerts.low)
  
  // Combine all alerts and sort by severity priority and call count
  const severityPriority = { critical: 4, warning: 3, medium: 2, low: 1 }
  const allAlerts = [
    ...criticalAlerts.map(a => ({ ...a, severityRank: severityPriority.critical })),
    ...warningAlerts.map(a => ({ ...a, severityRank: severityPriority.warning })),
    ...mediumAlerts.map(a => ({ ...a, severityRank: severityPriority.medium })),
    ...lowAlerts.map(a => ({ ...a, severityRank: severityPriority.low }))
  ].sort((a, b) => {
    // First sort by severity rank
    if (b.severityRank !== a.severityRank) {
      return b.severityRank - a.severityRank
    }
    // Then by call count
    return b.callCount - a.callCount
  })
  
  // Get top 4 most severe neighborhoods (these match what's shown on map)
  const top4Alerts = allAlerts.slice(0, 4)
  const remainingAlerts = allAlerts.slice(4)
  
  // Group remaining alerts by severity
  const remainingBySeverity = {
    critical: remainingAlerts.filter(a => a.severity === 'critical'),
    warning: remainingAlerts.filter(a => a.severity === 'warning'),
    medium: remainingAlerts.filter(a => a.severity === 'medium'),
    low: remainingAlerts.filter(a => a.severity === 'low')
  }
  
  const totalAlerts = criticalAlerts.length + warningAlerts.length
  const allSites = allAlerts.map(a => a.name)

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0"
          style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            zIndex: 35
          }}
          onClick={() => setActiveActionTab(null)}
        />
      )}

      {/* Panel */}
      <div
        className="fixed flex flex-col border"
        style={{
          top: `${panelTop}px`,
          left: `${panelLeft}px`,
          right: 'auto',
          bottom: 'auto',
          width: `${panelWidth}px`,
          maxHeight: `${panelMaxHeight}px`,
          backgroundColor: 'var(--sand-surface)',
          borderColor: 'var(--color-gray-700)',
          borderRadius: '14px',
          transition: 'none',
          boxShadow: isOpen ? '-4px 0 24px rgba(0, 0, 0, 0.5)' : 'none',
          zIndex: 40,
          display: isOpen ? 'flex' : 'none',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ 
            borderColor: 'var(--color-gray-700)',
            backgroundColor: 'rgba(0, 0, 0, 0.2)'
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" style={{ color: '#fca5a5' }} />
            <h2 className="text-sm font-bold tracking-wide" style={{ color: 'var(--color-gray-100)' }}>
              ACTION REQUIRED
            </h2>
            {totalAlerts > 0 && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{
                  backgroundColor: 'rgba(220, 38, 38, 0.15)',
                  color: '#fca5a5',
                }}
              >
                {totalAlerts}
              </span>
            )}
          </div>
          <button
            onClick={() => setActiveActionTab(null)}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--color-gray-400)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-gray-100)'
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-gray-400)'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* TOP 4 PRIORITY Section - Matches map view */}
          {top4Alerts.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold tracking-wider" style={{ color: 'var(--color-gray-300)' }}>
                  TOP PRIORITY (Shown on Map)
                </h3>
              </div>
              <div className="flex flex-col gap-3">
                {top4Alerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onClose={() => handleCloseAlert(alert.id)}
                    onViewSite={() => handleViewSite(alert)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Divider if there are remaining alerts */}
          {remainingAlerts.length > 0 && top4Alerts.length > 0 && (
            <div className="mb-6 border-t" style={{ borderColor: 'var(--color-gray-700)' }} />
          )}

          {/* CRITICAL Section - Remaining */}
          {remainingBySeverity.critical.length > 0 && (
            <div className="mb-6">
              <button
                onClick={() => toggleSection('critical')}
                className="flex items-center justify-between w-full mb-3"
              >
                <h3 className="text-xs font-bold tracking-wider" style={{ color: '#fca5a5' }}>
                  CRITICAL ({remainingBySeverity.critical.length})
                </h3>
                <ChevronRight 
                  className="w-4 h-4 transition-transform"
                  style={{ 
                    color: '#fca5a5',
                    transform: expandedSections.critical ? 'rotate(90deg)' : 'rotate(0deg)'
                  }}
                />
              </button>
              {expandedSections.critical && (
                <div className="flex flex-col gap-3">
                  {remainingBySeverity.critical.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onClose={() => handleCloseAlert(alert.id)}
                      onViewSite={() => handleViewSite(alert)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* WARNING Section - Remaining */}
          {remainingBySeverity.warning.length > 0 && (
            <div className="mb-6">
              <button
                onClick={() => toggleSection('warning')}
                className="flex items-center justify-between w-full mb-3"
              >
                <h3 className="text-xs font-bold tracking-wider" style={{ color: '#fbbf24' }}>
                  WARNING ({remainingBySeverity.warning.length})
                </h3>
                <ChevronRight 
                  className="w-4 h-4 transition-transform"
                  style={{ 
                    color: '#fbbf24',
                    transform: expandedSections.warning ? 'rotate(90deg)' : 'rotate(0deg)'
                  }}
                />
              </button>
              {expandedSections.warning && (
                <div className="flex flex-col gap-3">
                  {remainingBySeverity.warning.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onClose={() => handleCloseAlert(alert.id)}
                      onViewSite={() => handleViewSite(alert)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MEDIUM Section - Remaining */}
          {remainingBySeverity.medium.length > 0 && (
            <div className="mb-6">
              <button
                onClick={() => toggleSection('medium')}
                className="flex items-center justify-between w-full mb-3"
              >
                <h3 className="text-xs font-bold tracking-wider" style={{ color: '#60a5fa' }}>
                  MEDIUM ({remainingBySeverity.medium.length})
                </h3>
                <ChevronRight 
                  className="w-4 h-4 transition-transform"
                  style={{ 
                    color: '#60a5fa',
                    transform: expandedSections.medium ? 'rotate(90deg)' : 'rotate(0deg)'
                  }}
                />
              </button>
              {expandedSections.medium && (
                <div className="flex flex-col gap-3">
                  {remainingBySeverity.medium.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onClose={() => handleCloseAlert(alert.id)}
                      onViewSite={() => handleViewSite(alert)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LOW Section - Remaining */}
          {remainingBySeverity.low.length > 0 && (
            <div className="mb-6">
              <button
                onClick={() => toggleSection('low')}
                className="flex items-center justify-between w-full mb-3"
              >
                <h3 className="text-xs font-bold tracking-wider" style={{ color: 'var(--color-gray-500)' }}>
                  LOW ({remainingBySeverity.low.length})
                </h3>
                <ChevronRight 
                  className="w-4 h-4 transition-transform"
                  style={{ 
                    color: 'var(--color-gray-500)',
                    transform: expandedSections.low ? 'rotate(90deg)' : 'rotate(0deg)'
                  }}
                />
              </button>
              {expandedSections.low && (
                <div className="flex flex-col gap-3">
                  {remainingBySeverity.low.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onClose={() => handleCloseAlert(alert.id)}
                      onViewSite={() => handleViewSite(alert)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {totalAlerts === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="w-12 h-12 mb-3" style={{ color: 'var(--color-gray-600)' }} />
              <p className="text-sm" style={{ color: 'var(--color-gray-500)' }}>
                No active alerts
              </p>
            </div>
          )}
        </div>

        {/* Footer - Sites Count */}
        {allSites.length > 0 && (
          <div
            className="px-5 py-3 border-t"
            style={{ 
              borderColor: 'var(--color-gray-700)',
              backgroundColor: 'rgba(0, 0, 0, 0.2)'
            }}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold" style={{ color: 'var(--color-gray-400)' }}>
                SITES ({allSites.length})
              </p>
              <div className="flex flex-wrap gap-1.5 justify-end max-w-[240px]">
                {allSites.slice(0, 5).map((site, idx) => (
                  <span
                    key={idx}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--color-gray-400)',
                    }}
                  >
                    {site}
                  </span>
                ))}
                {allSites.length > 5 && (
                  <span
                    className="text-xs px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--color-gray-500)',
                    }}
                  >
                    +{allSites.length - 5}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

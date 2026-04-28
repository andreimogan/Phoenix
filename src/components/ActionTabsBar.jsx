import { AlertTriangle, TrendingUp } from 'lucide-react'
import { usePanelContext } from '../contexts/PanelContext'

export default function ActionTabsBar() {
  const { activeActionTab, setActiveActionTab, setActionTabAnchor, neighborhoodAlerts } = usePanelContext()

  const tabs = [
    {
      id: 'alerts',
      label: 'Alerts',
      icon: AlertTriangle,
      count: neighborhoodAlerts ? 
        (neighborhoodAlerts.critical?.length || 0) + (neighborhoodAlerts.warning?.length || 0) : 0
    },
    {
      id: 'forecasting',
      label: 'Forecasting',
      icon: TrendingUp,
      count: null
    },
  ]

  const handleTabClick = (tabId, event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setActionTabAnchor({
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    })

    if (activeActionTab === tabId) {
      setActiveActionTab(null)
    } else {
      setActiveActionTab(tabId)
    }
  }

  const buttonStyle = {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: 'transparent',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    transition: 'all 0.15s',
    cursor: 'pointer',
    position: 'relative',
  }

  return (
    <div className="flex items-center h-9">
      {tabs.map((tab, index) => {
        const Icon = tab.icon
        const isActive = activeActionTab === tab.id
        const isFirst = index === 0
        const isLast = index === tabs.length - 1

        return (
          <button
            key={tab.id}
            onClick={(event) => handleTabClick(tab.id, event)}
            title={tab.label}
            style={{
              ...buttonStyle,
              backgroundColor: isActive ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              color: isActive ? '#60a5fa' : 'rgba(255, 255, 255, 0.5)',
              borderTopLeftRadius: isFirst ? '8px' : '0',
              borderBottomLeftRadius: isFirst ? '8px' : '0',
              borderTopRightRadius: isLast ? '8px' : '0',
              borderBottomRightRadius: isLast ? '8px' : '0',
              borderLeft: isFirst ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              borderRight: '1px solid rgba(255, 255, 255, 0.1)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)'
              }
            }}
          >
            <Icon className="w-4 h-4" />
            {tab.count !== null && tab.count > 0 && (
              <span
                className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  minWidth: '18px',
                  height: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                }}
              >
                {tab.count > 99 ? '99+' : tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

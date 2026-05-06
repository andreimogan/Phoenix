import { usePanelContext } from '../contexts/PanelContext'

export default function ActionTabsBar() {
  const { selectedCity, activeActionTab, setActiveActionTab, setActionTabAnchor } = usePanelContext()

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

  const isPhoenix = selectedCity === 'phoenix'
  const alertsCount = isPhoenix ? 3 : 0
  const isActive = activeActionTab === 'alerts'

  return (
    <div className="flex items-center h-9">
      <button
        onClick={(event) => handleTabClick('alerts', event)}
        title="Alerts"
        className="h-9 px-3 rounded-[10px] border text-[13px] font-semibold inline-flex items-center gap-2"
        style={{
          borderColor: 'rgba(255, 255, 255, 0.12)',
          background: isActive ? 'rgba(59, 130, 246, 0.20)' : 'rgba(255, 255, 255, 0.05)',
          color: isActive ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.70)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.10)'
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
        }}
      >
        <span>Alerts</span>
        <span
          className="inline-flex items-center justify-center text-[11px] font-bold rounded-full px-2 h-[18px]"
          style={{
            backgroundColor: '#dc2626',
            color: '#ffffff',
            minWidth: 22,
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.30)',
          }}
        >
          {alertsCount}
        </span>
      </button>
    </div>
  )
}

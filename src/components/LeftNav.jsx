import { Map, Activity, ClipboardList, TrendingUp, DollarSign, Building2, ChevronLeft } from 'lucide-react'
import { usePanelContext } from '../contexts/PanelContext'

const sandLogo = '/sand-logo.png'

export default function LeftNav() {
  const { currentView, setCurrentView } = usePanelContext()

  const navItems = [
    {
      id: 'map',
      icon: Map,
      label: 'Map View',
      enabled: true
    },
    {
      id: 'performance',
      icon: Activity,
      label: 'City Performance & Reliability',
      enabled: false
    },
    {
      id: 'work-orders',
      icon: ClipboardList,
      label: 'Work Orders',
      enabled: true
    },
    {
      id: 'risk',
      icon: TrendingUp,
      label: 'City Risk & Resilience',
      enabled: false
    },
    {
      id: 'economic',
      icon: DollarSign,
      label: 'City Economic Health',
      enabled: false
    },
    {
      id: 'capital',
      icon: Building2,
      label: 'Capital & Asset Stewardship',
      enabled: false
    }
  ]

  const sidebarStyle = {
    backgroundColor: '#171717',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    boxShadow: '0 4px 6px 0 rgba(0, 0, 0, 0.1), 0 2px 4px 0 rgba(0, 0, 0, 0.1)',
  }

  const buttonBaseStyle = {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    transition: 'all 0.15s',
    cursor: 'pointer',
    border: 'none',
    position: 'relative',
  }

  return (
    <div 
      className="fixed z-40 flex flex-col border rounded-lg"
      style={{
        ...sidebarStyle,
        left: '16px',
        top: '80px',
        bottom: '16px',
        width: '48px',
        padding: '8px',
      }}
    >
      {/* Header - Logo/Brand button */}
      <div className="flex flex-col gap-2 items-center pb-2">
        <button
          style={{
            ...buttonBaseStyle,
            backgroundColor: '#1d4ed8', // Blue brand color from Figma
            padding: '10px',
          }}
          title="Home"
        >
          <img
            src={sandLogo}
            alt="Sand"
            style={{
              width: '16px',
              height: '16px',
              objectFit: 'contain',
            }}
          />
        </button>
        
        {/* Collapse icon */}
        <button
          style={{
            ...buttonBaseStyle,
            backgroundColor: 'transparent',
            width: '16px',
            height: '16px',
            color: 'rgba(255, 255, 255, 0.4)',
          }}
          title="Collapse sidebar"
        >
          <ChevronLeft size={12} />
        </button>
      </div>

      {/* Navigation items - First group */}
      <div className="flex flex-col gap-1 items-center py-2">
        {navItems.slice(0, 1).map((item) => {
          const Icon = item.icon
          const isActive = currentView === item.id
          const isDisabled = !item.enabled

          return (
            <button
              key={item.id}
              disabled={isDisabled}
              onClick={() => item.enabled && setCurrentView(item.id)}
              title={item.label}
              style={{
                ...buttonBaseStyle,
                backgroundColor: 'transparent',
                color: isDisabled ? 'rgba(255, 255, 255, 0.3)' : isActive ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)',
                opacity: isDisabled ? 0.4 : 1,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!isDisabled && !isActive) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              <Icon size={16} />
            </button>
          )
        })}
      </div>

      {/* Navigation items - Second group (main pages) */}
      <div className="flex flex-col gap-1 items-center py-2 mt-3">
        {navItems.slice(1).map((item) => {
          const Icon = item.icon
          const isActive = currentView === item.id
          const isDisabled = !item.enabled

          return (
            <button
              key={item.id}
              disabled={isDisabled}
              onClick={() => item.enabled && setCurrentView(item.id)}
              title={item.label}
              style={{
                ...buttonBaseStyle,
                backgroundColor: 'transparent',
                color: isDisabled ? 'rgba(255, 255, 255, 0.3)' : isActive ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)',
                opacity: isDisabled ? 0.7 : 1,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!isDisabled && !isActive) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              <Icon size={16} />
            </button>
          )
        })}
      </div>

      {/* Spacer to push footer to bottom */}
      <div className="flex-1" />

      {/* Bottom section - User profile */}
      <div className="flex flex-col items-center pt-2 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <button
          style={{
            ...buttonBaseStyle,
            backgroundColor: '#1d4ed8',
          }}
          title="User Profile"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#2563eb'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1d4ed8'
          }}
        >
          <div 
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '8px',
              fontWeight: 600,
              color: '#1d4ed8',
            }}
          >
            U
          </div>
        </button>
      </div>
    </div>
  )
}

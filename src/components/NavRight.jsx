import {
  Layers,
  MoreHorizontal,
} from 'lucide-react'
import { usePanelContext } from '../contexts/PanelContext'
import { useState } from 'react'

const sandLogo = '/sand-logo.png'

export default function NavRight() {
  const { 
    toggleCopilot, 
    toggleLayers, 
    layersVisible,
    setBaltimoreNeighborhoodsAffected,
    setBaltimore311Visible,
    phoenixWeatherWindowVisible,
    setPhoenixWeatherWindowVisible,
    phoenixLatest311WindowVisible,
    setPhoenixLatest311WindowVisible,
    phoenixInterventionWindowVisible,
    setPhoenixInterventionWindowVisible,
    phoenixBriefingRoomVisible,
    setPhoenixBriefingRoomVisible,
    kpiCardsVisible,
    setKpiCardsVisible,
    heatReliefKpiCardsVisible,
    setHeatReliefKpiCardsVisible,
    toggleRightWindow,
  } = usePanelContext()

  const [windowsMenuOpen, setWindowsMenuOpen] = useState(false)

  const controlStyle = {
    background: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.9)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  }

  return (
    <div className="flex items-center gap-4 shrink-0">

      {/* Button Group: Layers */}
      <div className="flex items-center h-9">
        <button
          className="flex items-center justify-center w-9 h-9 border transition-colors"
          style={{
            ...controlStyle,
            borderTopLeftRadius: '8px',
            borderBottomLeftRadius: '8px',
            borderTopRightRadius: '8px',
            borderBottomRightRadius: '8px',
            background: layersVisible ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
          }}
          title="Map Layers"
          onClick={toggleLayers}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = layersVisible ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)' }}
        >
          <Layers className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Windows menu */}
      <div className="relative">
        <button
          className="flex items-center justify-center w-9 h-9 border transition-colors rounded-[8px]"
          style={{ ...controlStyle }}
          title="Windows"
          onClick={() => setWindowsMenuOpen((v) => !v)}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
        >
          <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
        </button>

        {windowsMenuOpen && (
          <div
            className="absolute right-0 mt-2 rounded-[12px] border shadow-xl overflow-hidden"
            style={{
              width: 260,
              zIndex: 200,
              background: 'rgba(23, 23, 23, 0.95)',
              backdropFilter: 'blur(12px) saturate(160%)',
              borderColor: 'rgba(255,255,255,0.10)',
              boxShadow: '0 18px 40px rgba(0,0,0,0.55), 0 10px 18px rgba(0,0,0,0.35)',
            }}
          >
            <div className="px-3 py-2 text-[11px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Windows
            </div>
            <div className="px-2 pb-2 flex flex-col gap-1">
              {[
                {
                  label: 'Weather information',
                  checked: !!phoenixWeatherWindowVisible,
                  onToggle: () => toggleRightWindow('weather'),
                },
                {
                  label: 'KPI Cards',
                  checked: !!kpiCardsVisible,
                  onToggle: () => setKpiCardsVisible((v) => !v),
                },
                {
                  label: 'Heat Relief KPI Cards',
                  checked: !!heatReliefKpiCardsVisible,
                  onToggle: () => setHeatReliefKpiCardsVisible((v) => !v),
                },
                {
                  label: 'Latest 311 Service Requests',
                  checked: !!phoenixLatest311WindowVisible,
                  onToggle: () => toggleRightWindow('latest311'),
                },
                {
                  label: 'Immediate Intervention Needed',
                  checked: !!phoenixInterventionWindowVisible,
                  onToggle: () => toggleRightWindow('intervention'),
                },
                {
                  label: 'Briefing Room',
                  checked: !!phoenixBriefingRoomVisible,
                  onToggle: () => toggleRightWindow('briefingRoom'),
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="w-full flex items-center justify-between gap-3 px-2 py-2 rounded-[10px] border text-left"
                  style={{
                    borderColor: 'rgba(255,255,255,0.08)',
                    background: item.checked ? 'rgba(59,130,246,0.16)' : 'rgba(255,255,255,0.02)',
                    color: 'rgba(255,255,255,0.92)',
                  }}
                  onClick={item.onToggle}
                >
                  <span className="text-[12px] font-semibold truncate">{item.label}</span>
                  <span
                    className="inline-flex h-4 w-7 rounded-full p-[2px] border"
                    style={{
                      borderColor: 'rgba(255,255,255,0.12)',
                      background: item.checked ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <span
                      className="h-3 w-3 rounded-full bg-white"
                      style={{ transform: item.checked ? 'translateX(12px)' : 'translateX(0)', transition: 'transform 150ms ease' }}
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Ask SIA */}
      <button
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors rounded-[8px] text-sm h-9 px-4"
        style={{
          background: '#e5e5e5',
          color: '#171717',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}
        title="Water OS Copilot"
        onClick={toggleCopilot}
        onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#e5e5e5'}
      >
        <span className="w-4 h-4 block shrink-0 overflow-hidden" aria-hidden="true">
          <img
            src={sandLogo}
            alt=""
            className="w-full h-full object-contain"
          />
        </span>
        Ask SIA
      </button>

    </div>
  )
}

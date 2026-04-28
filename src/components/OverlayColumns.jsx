import { usePanelContext } from '../contexts/PanelContext'
import CityKPICards from './CityKPICards'
import WeatherInfoWindow from './windows/WeatherInfoWindow'
import Latest311Window from './windows/Latest311Window'
import ImmediateInterventionWindow from './windows/ImmediateInterventionWindow'
import BriefingRoomWindow from './windows/BriefingRoomWindow'

export default function OverlayColumns() {
  const {
    currentView,
    kpiCardsVisible,
    phoenixWeatherWindowVisible,
    phoenixLatest311WindowVisible,
    phoenixInterventionWindowVisible,
    phoenixBriefingRoomVisible,
    rightWindowsOrder,
  } = usePanelContext()

  if (currentView === 'performance' || currentView === 'work-orders') return null

  const anyRight =
    !!phoenixWeatherWindowVisible ||
    !!phoenixLatest311WindowVisible ||
    !!phoenixInterventionWindowVisible ||
    !!phoenixBriefingRoomVisible

  const anyLeft = !!kpiCardsVisible

  if (!anyLeft && !anyRight) return null

  return (
    <div
      className="fixed"
      style={{
        top: '84px',
        left: '16px',
        right: '16px',
        bottom: '16px',
        zIndex: 40,
        pointerEvents: 'none',
      }}
      aria-label="Overlay columns"
    >
      <div className="w-full h-full flex items-start justify-between gap-4">
        {/* Left overlay column */}
        <div
          style={{
            width: '300px',
            height: '100%',
            marginLeft: '64px',
            pointerEvents: 'auto',
          }}
        >
          {kpiCardsVisible ? <CityKPICards /> : null}
        </div>

        {/* Right overlay wrap */}
        <div
          style={{
            height: '100%',
            minHeight: 0,
            width: 'auto',
            display: 'flex',
            flexFlow: 'column wrap-reverse',
            alignContent: 'flex-start',
            gap: 12,
            pointerEvents: 'auto',
          }}
          aria-label="Right windows"
        >
          {(rightWindowsOrder || []).map((id) => {
            if (id === 'weather') return phoenixWeatherWindowVisible ? <WeatherInfoWindow key={id} /> : null
            if (id === 'latest311') return phoenixLatest311WindowVisible ? <Latest311Window key={id} /> : null
            if (id === 'intervention') return phoenixInterventionWindowVisible ? <ImmediateInterventionWindow key={id} /> : null
            if (id === 'briefingRoom') return phoenixBriefingRoomVisible ? <BriefingRoomWindow key={id} /> : null
            return null
          })}
        </div>
      </div>
    </div>
  )
}


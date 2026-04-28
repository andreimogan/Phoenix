import TopNav from './components/TopNav'
import MapView from './components/MapView'
import SuccessNotifications from './components/notifications/SuccessNotifications'
import LeftNav from './components/LeftNav'
import PerformancePage from './components/PerformancePage'
import WorkOrdersPage from './components/WorkOrdersPage'
import AlertsPanel from './components/AlertsPanel'
import ForecastingPanel from './components/ForecastingPanel'
import OverlayColumns from './components/OverlayColumns'
import {
  WaterOSCopilotPanel,
  ManageMapLayersPanel,
} from './components/panels'
import { PanelProvider, usePanelContext } from './contexts/PanelContext'
import { generatePerformanceModalData, generateNeighborhoodAlerts, generatePotholeForecasts } from './utils/performanceAnalytics'
import { useEffect } from 'react'

function AppContent() {
  const { 
    currentView, 
    selectedCity, 
    baltimore311Data, 
    selectedDate, 
    healthOverdoseData,
    setNeighborhoodAlerts,
    setPotholeForecasts,
  } = usePanelContext()

  // Generate performance data when needed
  const performanceData = currentView === 'performance' && selectedCity === 'baltimore' && baltimore311Data
    ? generatePerformanceModalData(selectedDate, baltimore311Data, healthOverdoseData)
    : null

  // Generate neighborhood alerts whenever data changes
  useEffect(() => {
    if (selectedCity === 'baltimore' && baltimore311Data) {
      const alerts = generateNeighborhoodAlerts(selectedDate, baltimore311Data)
      setNeighborhoodAlerts(alerts)
    } else {
      setNeighborhoodAlerts(null)
    }
  }, [selectedCity, baltimore311Data, selectedDate, setNeighborhoodAlerts])
  
  // Generate pothole forecasts whenever data changes
  useEffect(() => {
    if (selectedCity === 'baltimore' && baltimore311Data) {
      const forecasts = generatePotholeForecasts(selectedDate, baltimore311Data)
      setPotholeForecasts(forecasts)
    } else {
      setPotholeForecasts(null)
    }
  }, [selectedCity, baltimore311Data, selectedDate, setPotholeForecasts])

  return (
    <>
      <TopNav />
      <LeftNav />
      
      <main
        className="relative flex-1 min-h-[calc(100vh-var(--nav-height))] bg-[var(--content-bg)]"
        aria-label="Main content"
      >
        {/* Map View */}
        {currentView === 'map' && (
          <>
            <MapView />
            <OverlayColumns />
          </>
        )}

        {/* Performance Page */}
        {currentView === 'performance' && (
          <PerformancePage data={performanceData} />
        )}

        {/* Work Orders Page */}
        {currentView === 'work-orders' && (
          <WorkOrdersPage />
        )}

        {/* Common components */}
        <SuccessNotifications />
        <WaterOSCopilotPanel />
        <ManageMapLayersPanel />
        
        {/* Action Panels */}
        <AlertsPanel />
        <ForecastingPanel />
      </main>
    </>
  )
}

function App() {
  return (
    <PanelProvider>
      <AppContent />
    </PanelProvider>
  )
}

export default App

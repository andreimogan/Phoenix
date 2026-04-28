import { useState } from 'react'
import { ChevronRight, TrendingUp } from 'lucide-react'
import ForecastCard from './ForecastCard'
import { usePanelContext } from '../contexts/PanelContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'

export default function ForecastingPanel() {
  const { 
    activeActionTab, 
    setActiveActionTab, 
    actionTabAnchor,
    potholeForecasts,
    setCurrentView 
  } = usePanelContext()
  
  const [selectedUseCase, setSelectedUseCase] = useState('potholes')

  const isOpen = activeActionTab === 'forecasting'
  const panelWidth = 480
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

  if (!potholeForecasts) return null

  const useCases = [
    {
      id: 'potholes',
      label: 'Pothole Formation',
      icon: TrendingUp,
      description: '12-week pothole risk forecast based on historical patterns, weather predictions, and road degradation',
    }
  ]

  // Custom tooltip for forecast chart
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null
    
    const dataPoint = payload[0].payload
    
    return (
      <div
        className="rounded-lg border px-3 py-2 shadow-xl"
        style={{
          background: 'rgba(23, 23, 23, 0.95)',
          backdropFilter: 'blur(12px)',
          borderColor: 'rgba(255, 255, 255, 0.1)'
        }}
      >
        <div className="text-[11px] font-medium text-white/50 mb-1">
          {dataPoint.fullDate}
        </div>
        <div className="text-[13px] font-semibold text-white">
          {dataPoint.count} predicted potholes
        </div>
        {dataPoint.confidence && (
          <div className="text-[11px] text-white/40 mt-0.5">
            {dataPoint.confidence}% confidence
          </div>
        )}
      </div>
    )
  }

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
            <TrendingUp className="w-5 h-5" style={{ color: '#60a5fa' }} />
            <h2 className="text-sm font-bold tracking-wide" style={{ color: 'var(--color-gray-100)' }}>
              FORECASTING
            </h2>
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
          {/* Pothole Forecast */}
          {selectedUseCase === 'potholes' && potholeForecasts && (
            <>
              {/* Subtitle - Simple text instead of button */}
              <div className="mb-3">
                <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-gray-100)' }}>
                  Pothole Formation Forecast
                </h3>
                <p className="text-xs" style={{ color: 'var(--color-gray-400)' }}>
                  24-week forecast starting next week, based on historical patterns, weather, and road degradation
                </p>
              </div>

              {/* Forecast Factors - Smaller, moved up */}
              <div className="mb-4 flex flex-wrap gap-2">
                {potholeForecasts.factors.map((factor, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: factor.color }}
                    />
                    <span className="text-[11px] font-medium" style={{ color: 'var(--color-gray-500)' }}>
                      {factor.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Forecast Chart */}
              <div className="mb-4">
                <div
                  className="p-4 rounded-[14px] border"
                  style={{
                    backgroundColor: 'var(--sand-surface)',
                    borderColor: 'var(--color-gray-700)',
                  }}
                >
                  {/* Legend - Only Forecast now */}
                  <div className="flex items-center gap-4 mb-3 pb-2 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: '#fbbf24', opacity: 0.8 }} />
                      <span className="text-[11px]" style={{ color: 'var(--color-gray-400)' }}>Weekly Forecast (Exp. Smoothing)</span>
                    </div>
                  </div>
                  
                  <div style={{ width: '100%', height: '200px' }}>
                    <ResponsiveContainer>
                      <BarChart 
                        data={potholeForecasts.chartData}
                        barCategoryGap="8%"
                        barGap={0}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
                        <XAxis 
                          dataKey="week" 
                          stroke="rgba(255, 255, 255, 0.3)"
                          style={{ fontSize: '10px' }}
                          tick={{ fill: 'rgba(255, 255, 255, 0.5)' }}
                          interval={3}
                        />
                        <YAxis 
                          stroke="rgba(255, 255, 255, 0.3)"
                          style={{ fontSize: '10px' }}
                          tick={{ fill: 'rgba(255, 255, 255, 0.5)' }}
                          allowDecimals={false}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
                        {/* Single bar - all forecast (yellow) */}
                        <Bar 
                          dataKey="count" 
                          radius={[4, 4, 0, 0]}
                          minPointSize={2}
                          fill="#fbbf24"
                          opacity={0.8}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Recommendation - Compact version after chart */}
              {potholeForecasts.recommendation && (
                <div
                  className="mb-4 p-3 rounded-[14px] border-l-2"
                  style={{
                    backgroundColor: 'rgba(96, 165, 250, 0.05)',
                    borderColor: '#60a5fa',
                  }}
                >
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#60a5fa' }} />
                    <div className="flex-1">
                      <h3 className="text-xs font-bold mb-1" style={{ color: '#60a5fa' }}>
                        RECOMMENDED ACTION
                      </h3>
                      <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--color-gray-300)' }}>
                        {potholeForecasts.recommendation.description}
                      </p>
                      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-gray-500)' }}>
                        {potholeForecasts.recommendation.impact}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* High-Risk Neighborhoods - Compressed */}
              <div className="mb-6">
                <h3 className="text-xs font-bold tracking-wider mb-3" style={{ color: 'var(--color-gray-300)' }}>
                  HIGH-RISK NEIGHBORHOODS
                </h3>
                <div className="flex flex-col gap-2">
                  {potholeForecasts.neighborhoods.map((neighborhood) => (
                    <div
                      key={neighborhood.id}
                      className="p-3 rounded-[14px] border"
                      style={{
                        backgroundColor: 'var(--sand-surface)',
                        borderColor: 'var(--color-gray-700)',
                      }}
                    >
                      {/* Compact header */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 flex-1">
                          <h4 className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>
                            {neighborhood.name}
                          </h4>
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border"
                            style={{
                              backgroundColor: neighborhood.riskLevel === 'high' ? 'rgba(252, 165, 165, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                              borderColor: neighborhood.riskLevel === 'high' ? 'rgba(252, 165, 165, 0.35)' : 'rgba(251, 191, 36, 0.35)',
                              color: neighborhood.riskLevel === 'high' ? '#fca5a5' : '#fbbf24',
                            }}
                          >
                            {neighborhood.riskLevel.toUpperCase()}
                          </span>
                          {neighborhood.trend === 'increasing' && (
                            <span className="text-xs font-medium" style={{ color: '#fca5a5' }}>
                              +{neighborhood.increasePercent}%
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setCurrentView('map')}
                          className="text-xs font-medium transition-colors"
                          style={{ color: '#60a5fa' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#93c5fd'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#60a5fa'
                          }}
                        >
                          View
                        </button>
                      </div>
                      {/* Compact subtitle */}
                      <p className="text-[11px]" style={{ color: 'var(--color-gray-500)' }}>
                        {neighborhood.subtitle}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

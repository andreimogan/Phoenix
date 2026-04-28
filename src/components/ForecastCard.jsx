import { ArrowRight, TrendingUp, AlertTriangle } from 'lucide-react'

export default function ForecastCard({ forecast, onViewSite }) {
  // Determine risk level color
  const getRiskColor = (level) => {
    switch (level) {
      case 'high': return '#fca5a5'
      case 'medium': return '#fbbf24'
      case 'low': return '#86efac'
      default: return 'var(--color-gray-400)'
    }
  }

  const riskColor = getRiskColor(forecast.riskLevel)

  return (
    <div
      className="p-6 rounded-[14px] border"
      style={{
        backgroundColor: 'var(--sand-surface)',
        borderColor: 'var(--color-gray-700)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-gray-100)' }}>
            {forecast.name}
          </h4>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border"
              style={{
                backgroundColor: `${riskColor}22`,
                borderColor: `${riskColor}55`,
                color: riskColor,
              }}
            >
              {forecast.riskLevel.toUpperCase()} RISK
            </span>
            {forecast.trend === 'increasing' && (
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" style={{ color: riskColor }} />
                <span className="text-xs" style={{ color: riskColor }}>
                  +{forecast.increasePercent}%
                </span>
              </div>
            )}
          </div>
          <p className="text-xs" style={{ color: 'var(--color-gray-400)' }}>
            {forecast.subtitle}
          </p>
        </div>
      </div>

      {/* Factors */}
      {forecast.factors && forecast.factors.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-gray-500)' }}>
            KEY FACTORS
          </p>
          <div className="flex flex-col gap-1">
            {forecast.factors.map((factor, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div
                  className="w-1 h-1 rounded-full mt-1.5"
                  style={{ backgroundColor: 'var(--color-gray-500)' }}
                />
                <p className="text-xs" style={{ color: 'var(--color-gray-300)' }}>
                  {factor}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Site Button */}
      <button
        onClick={onViewSite}
        className="flex items-center gap-1 text-xs font-medium transition-colors"
        style={{ color: '#60a5fa' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#93c5fd'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#60a5fa'
        }}
      >
        View on Map
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  )
}

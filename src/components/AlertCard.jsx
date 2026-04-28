import { X, ArrowRight } from 'lucide-react'

export default function AlertCard({ alert, onClose, onViewSite }) {
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
            {alert.name}
          </h4>
          <p className="text-base font-bold mb-1" style={{ color: 'var(--color-gray-100)' }}>
            {alert.title}
          </p>
          <p className="text-xs" style={{ color: 'var(--color-gray-400)' }}>
            {alert.subtitle}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded transition-colors flex-shrink-0"
          style={{ color: 'var(--color-gray-500)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-gray-200)'
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-gray-500)'
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Recommendation */}
      <div className="mb-3">
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-gray-500)' }}>
          RECOMMENDATION
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-gray-300)' }}>
          {alert.recommendation}
        </p>
      </div>

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
        View Site
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  )
}

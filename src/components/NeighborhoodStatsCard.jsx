// Neighborhood stats card component
import { X } from 'lucide-react'

export default function NeighborhoodStatsCard({ neighborhood, isMinimized, onMinimize }) {
  const { name, count, residents, topTypes, color } = neighborhood

  // Color mapping matching neighborhood density colors
  const colorStyles = {
    red: {
      accentColor: '#ef4444',
      dotColor: '#fb923c'
    },
    orange: {
      accentColor: '#f97316',
      dotColor: '#fb923c'
    },
    amber: {
      accentColor: '#f59e0b',
      dotColor: '#fb923c'
    },
    yellow: {
      accentColor: '#eab308',
      dotColor: '#fb923c'
    },
    gray: {
      accentColor: '#6b7280',
      dotColor: '#9ca3af'
    }
  }

  const style = colorStyles[color] || colorStyles.gray

  if (isMinimized) {
    return null
  }

  // Format top types into readable summary
  const topTypesSummary = topTypes && topTypes.length > 0 
    ? topTypes[0].type.toLowerCase()
    : 'various issues'

  return (
    <div 
      className="neighborhood-stats-card"
      style={{
        minWidth: '200px',
        backgroundColor: 'var(--sand-surface)', // #1a1d22
        border: '1px solid var(--color-gray-700)',
        borderRadius: 'var(--radius-xl, 8px)',
        padding: '12px 14px',
        color: 'var(--color-gray-100)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        fontFamily: 'var(--font-family-primary)',
        fontSize: '13px',
        lineHeight: '1.5',
        pointerEvents: 'auto',
        position: 'relative'
      }}
    >
      {/* Close button */}
      <button
        onClick={onMinimize}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'transparent',
          border: 'none',
          color: 'var(--color-gray-400)',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-gray-100)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-gray-400)' }}
        title="Minimize card"
      >
        <X size={14} />
      </button>

      {/* Header label */}
      <div style={{
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'rgba(255, 255, 255, 0.4)',
        marginBottom: '6px'
      }}>
        Neighborhood Impact
      </div>

      {/* Neighborhood name */}
      <div style={{ 
        fontWeight: 600, 
        fontSize: '14px',
        color: '#fff',
        marginBottom: '6px',
        lineHeight: '1.3',
        paddingRight: '20px'
      }}>
        {name}
      </div>

      {/* Request count and type summary */}
      <div style={{ 
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '12px',
        marginBottom: '2px'
      }}>
        {count} open {count === 1 ? 'request' : 'requests'} <span style={{ color: 'rgba(255, 255, 255, 0.35)' }}>· mostly {topTypesSummary}</span>
      </div>

      {/* Residents affected */}
      <div style={{ 
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: '12px',
        marginBottom: '8px'
      }}>
        ~{residents.toLocaleString()} residents affected
      </div>

      {/* Status badge with colored dot */}
      <div style={{ 
        marginTop: '8px',
        paddingTop: '8px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '5px',
          fontSize: '11px',
          fontWeight: 500,
          background: `${style.accentColor}26`, // 15% opacity
          color: style.dotColor,
          border: `1px solid ${style.accentColor}59` // 35% opacity
        }}>
          <span style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: style.dotColor,
            display: 'inline-block'
          }}></span>
          High Priority
        </span>
      </div>
    </div>
  )
}

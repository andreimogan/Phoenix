// Map pin component for neighborhood markers
export default function NeighborhoodPin({ color, onClick }) {
  // Color mapping matching neighborhood density colors
  const colorMap = {
    red: '#ef4444',
    orange: '#f97316',
    amber: '#f59e0b',
    yellow: '#eab308',
    gray: '#6b7280'
  }

  const fillColor = colorMap[color] || colorMap.gray

  return (
    <div 
      onClick={onClick}
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))',
        transition: 'transform 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.1)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {/* Pin SVG */}
      <svg 
        width="32" 
        height="40" 
        viewBox="0 0 32 40" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Pin shape */}
        <path
          d="M16 0C7.163 0 0 7.163 0 16c0 12 16 24 16 24s16-12 16-24c0-8.837-7.163-16-16-16z"
          fill={fillColor}
          stroke="white"
          strokeWidth="2"
        />
        {/* Inner circle */}
        <circle
          cx="16"
          cy="16"
          r="6"
          fill="white"
          opacity="0.9"
        />
      </svg>
    </div>
  )
}

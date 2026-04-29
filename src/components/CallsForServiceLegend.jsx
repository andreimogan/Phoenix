/**
 * Phoenix Calls for Service — default point style matches MapView `phoenix-cfs-points`
 * (circle-color #60a5fa, light stroke).
 */
const PHOENIX_CFS_POINT = {
  fill: '#60a5fa',
  stroke: 'rgba(255,255,255,0.35)',
}

export default function CallsForServiceLegend() {
  return (
    <div
      className="pointer-events-none rounded-lg border shadow-xl z-30 overflow-hidden"
      style={{
        backgroundColor: 'var(--sand-surface)',
        borderColor: 'var(--color-gray-700)',
        color: 'var(--color-gray-100)',
      }}
      role="region"
      aria-label="Map legend"
    >
      <div
        className="px-3 py-2 border-b"
        style={{ borderColor: 'var(--color-gray-700)' }}
      >
        <span className="text-[11px] font-semibold" style={{ color: 'var(--color-gray-200)' }}>
          Legend
        </span>
      </div>
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        <span
          className="shrink-0 rounded-full"
          style={{
            width: 10,
            height: 10,
            backgroundColor: PHOENIX_CFS_POINT.fill,
            opacity: 0.85,
            boxShadow: `0 0 0 1px ${PHOENIX_CFS_POINT.stroke}`,
          }}
          aria-hidden="true"
        />
        <span className="text-[12px] font-medium leading-snug" style={{ color: 'var(--color-gray-200)' }}>
          Calls for Service
        </span>
      </div>
    </div>
  )
}

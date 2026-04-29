function tempLegendGradientCssVertical() {
  // Matches temperature ramp in MapView.jsx (°F scale)
  return `linear-gradient(to top,
    rgba(242, 242, 242, 0.80) 0%,
    rgba(242, 154, 194, 0.80) 7.7%,
    rgba(217, 76, 154, 0.80) 15.4%,
    rgba(166, 51, 166, 0.80) 23.1%,
    rgba(106, 58, 166, 0.80) 30.8%,
    rgba(61, 58, 166, 0.80) 38.5%,
    rgba(43, 115, 210, 0.80) 46.2%,
    rgba(31, 191, 154, 0.80) 53.8%,
    rgba(63, 191, 74, 0.80) 61.5%,
    rgba(183, 225, 58, 0.80) 69.2%,
    rgba(242, 230, 70, 0.80) 76.9%,
    rgba(242, 178, 31, 0.80) 84.6%,
    rgba(242, 106, 42, 0.80) 92.3%,
    rgba(227, 58, 42, 0.80) 96.2%,
    rgba(198, 27, 31, 0.80) 98.1%,
    rgba(91, 15, 20, 0.80) 100%
  )`
}

const TEMP_BREAKS_F = [120, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0, -10, -20, -30, -40]

export default function TemperatureLegend() {
  return (
    <div
      className="rounded-xl border shadow-xl"
      style={{
        borderColor: 'var(--color-gray-700)',
        background: 'rgba(13, 17, 23, 0.88)',
        backdropFilter: 'blur(10px)',
        padding: 12,
        width: 220,
        pointerEvents: 'none',
      }}
      aria-label="Temperature legend"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-gray-400)' }}>
        Temperature (°F)
      </div>

      <div className="flex items-start gap-3">
        <div className="flex flex-col items-stretch gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px]" style={{ color: 'var(--color-gray-300)' }}>No Data</span>
            <span
              className="rounded-sm"
              style={{
                width: 36,
                height: 10,
                backgroundColor: 'rgba(156, 163, 175, 0.80)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
              }}
              aria-hidden
            />
          </div>

          <div className="flex items-stretch gap-3">
            <div
              className="rounded-sm"
              style={{
                width: 18,
                height: 220,
                background: tempLegendGradientCssVertical(),
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
              }}
              aria-hidden
            />
            <div className="flex flex-col justify-between" style={{ height: 220 }}>
              {TEMP_BREAKS_F.map((v) => (
                <div key={v} className="text-[11px] leading-none tabular-nums" style={{ color: 'var(--color-gray-200)' }}>
                  {v}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


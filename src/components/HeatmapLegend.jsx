import { GripVertical } from 'lucide-react'
import { useDraggable } from '../hooks/useDraggable'
import { usePanelContext } from '../contexts/PanelContext'

export default function HeatmapLegend() {
  const { heatmapConfig, setHeatmapConfig } = usePanelContext()
  
  const LEGEND_WIDTH = 280
  const LEGEND_HEIGHT = 'auto'
  const BOTTOM_MARGIN = 24
  const RIGHT_MARGIN = 24

  const getBottomRightPosition = () => ({
    x: typeof window !== 'undefined' ? window.innerWidth - LEGEND_WIDTH - RIGHT_MARGIN : 0,
    y: typeof window !== 'undefined' ? window.innerHeight - 450 - BOTTOM_MARGIN : 0,
  })

  const { position, isDragging, dragRef, handleMouseDown } = useDraggable(getBottomRightPosition())

  const updateConfig = (key, value) => {
    setHeatmapConfig(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div
      className="fixed rounded-lg border shadow-xl z-30 overflow-hidden"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
        width: `${LEGEND_WIDTH}px`,
        backgroundColor: 'var(--sand-surface)',
        borderColor: 'var(--color-gray-700)',
        color: 'var(--color-gray-100)',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div
        ref={dragRef}
        className="px-3 py-2 flex items-center gap-2 border-b select-none"
        style={{
          borderColor: 'var(--color-gray-700)',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <GripVertical className="w-3 h-3 shrink-0" style={{ color: 'var(--color-gray-400)' }} aria-hidden="true" />
        <span className="text-[11px] font-semibold" style={{ color: 'var(--color-gray-200)' }}>
          Heatmap Settings
        </span>
      </div>

      {/* Legend content */}
      <div className="p-3 space-y-3">
        {/* Gradient bar */}
        <div>
          <div className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--color-gray-400)' }}>
            Density Scale
          </div>
          <div className="relative h-6 rounded overflow-hidden mb-1" style={{
            background: 'linear-gradient(to right, rgba(150,100,180,0.6), rgba(180,80,140,0.7), rgba(220,50,80,0.8), rgba(240,100,50,0.9), rgba(255,220,50,1))'
          }}>
          </div>
          <div className="flex items-center justify-between text-[9px]" style={{ color: 'var(--color-gray-500)' }}>
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        {/* Weight */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-gray-400)' }}>
              Weight
            </label>
            <span className="text-[10px] font-mono" style={{ color: 'var(--color-gray-300)' }}>
              {heatmapConfig.weight.toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.1"
            value={heatmapConfig.weight}
            onChange={(e) => updateConfig('weight', parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--color-blue-600) 0%, var(--color-blue-600) ${((heatmapConfig.weight - 0.1) / 1.9) * 100}%, var(--color-gray-600) ${((heatmapConfig.weight - 0.1) / 1.9) * 100}%, var(--color-gray-600) 100%)`
            }}
          />
        </div>

        {/* Intensity */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-gray-400)' }}>
              Intensity
            </label>
            <span className="text-[10px] font-mono" style={{ color: 'var(--color-gray-300)' }}>
              {heatmapConfig.intensityMin.toFixed(1)} - {heatmapConfig.intensityMax.toFixed(1)}
            </span>
          </div>
          <div className="space-y-1">
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={heatmapConfig.intensityMax}
              onChange={(e) => updateConfig('intensityMax', parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--color-blue-600) 0%, var(--color-blue-600) ${((heatmapConfig.intensityMax - 0.1) / 4.9) * 100}%, var(--color-gray-600) ${((heatmapConfig.intensityMax - 0.1) / 4.9) * 100}%, var(--color-gray-600) 100%)`
              }}
            />
          </div>
        </div>

        {/* Radius */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-gray-400)' }}>
              Radius
            </label>
            <span className="text-[10px] font-mono" style={{ color: 'var(--color-gray-300)' }}>
              {heatmapConfig.radiusMin.toFixed(0)} - {heatmapConfig.radiusMax.toFixed(0)}
            </span>
          </div>
          <input
            type="range"
            min="5"
            max="50"
            step="1"
            value={heatmapConfig.radiusMax}
            onChange={(e) => updateConfig('radiusMax', parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--color-blue-600) 0%, var(--color-blue-600) ${((heatmapConfig.radiusMax - 5) / 45) * 100}%, var(--color-gray-600) ${((heatmapConfig.radiusMax - 5) / 45) * 100}%, var(--color-gray-600) 100%)`
            }}
          />
        </div>

        {/* Opacity */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-medium" style={{ color: 'var(--color-gray-400)' }}>
              Opacity
            </label>
            <span className="text-[10px] font-mono" style={{ color: 'var(--color-gray-300)' }}>
              {Math.round(heatmapConfig.opacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={heatmapConfig.opacity}
            onChange={(e) => updateConfig('opacity', parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--color-blue-600) 0%, var(--color-blue-600) ${heatmapConfig.opacity * 100}%, var(--color-gray-600) ${heatmapConfig.opacity * 100}%, var(--color-gray-600) 100%)`
            }}
          />
        </div>

        {/* Reset button */}
        <button
          className="w-full px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors"
          style={{
            color: 'var(--color-gray-300)',
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderColor: 'var(--color-gray-600)',
          }}
          onClick={() => setHeatmapConfig({
            weight: 1,
            intensityMin: 1,
            intensityMax: 3,
            radiusMin: 2,
            radiusMax: 20,
            opacity: 1,
          })}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
        >
          Reset to Default
        </button>
      </div>
    </div>
  )
}

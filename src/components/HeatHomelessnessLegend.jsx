import { usePanelContext } from '../contexts/PanelContext'
import DraggableFloatingPanel from './DraggableFloatingPanel'

/** Matches MapLibre paints in MapView.jsx for choropleths / homelessness points */

const HEAT_ILLNESS = {
  noData: 'rgba(82, 82, 91, 0.80)',
  gradient: [
    ['0', 'rgba(34, 197, 94, 0.80)'],
    ['50', 'rgba(234, 179, 8, 0.80)'],
    ['150', 'rgba(245, 158, 11, 0.80)'],
    ['250', 'rgba(245, 158, 11, 0.80)'],
    ['400', 'rgba(249, 115, 22, 0.80)'],
    ['700', 'rgba(239, 68, 68, 0.80)'],
  ],
}

const HEAT_DEATHS_VILLAGE = {
  gradient: [
    ['0', 'rgba(156, 163, 175, 0.20)'],
    ['5', 'rgba(250, 204, 21, 0.28)'],
    ['12', 'rgba(245, 158, 11, 0.34)'],
    ['25', 'rgba(239, 68, 68, 0.40)'],
  ],
}

const HOMELESSNESS_NEIGHBORHOOD_RAG = {
  gradient: [
    ['0', 'rgba(156, 163, 175, 0.20)'],
    ['10', 'rgba(250, 204, 21, 0.28)'],
    ['25', 'rgba(245, 158, 11, 0.34)'],
    ['50', 'rgba(239, 68, 68, 0.40)'],
  ],
}

const HOMELESSNESS_CATEGORIES = [
  { label: 'Emergency Shelter', color: '#f59e0b' },
  { label: 'Street Outreach', color: '#22c55e' },
  { label: 'Rapid Rehousing', color: '#3b82f6' },
]

function heatIllnessCssGradient() {
  return `linear-gradient(to right, ${HEAT_ILLNESS.gradient.map(([stop, color]) => {
    const pct = (Number(stop) / 700) * 100
    return `${color} ${pct}%`
  }).join(', ')})`
}

function discreteGradientCss(entries) {
  const maxVal = Number(entries[entries.length - 1][0])
  return `linear-gradient(to right, ${entries.map(([stop, color]) => {
    const pct = maxVal <= 0 ? 0 : (Number(stop) / maxVal) * 100
    return `${color} ${pct}%`
  }).join(', ')})`
}

function Section({ title, children, description }) {
  return (
    <div className="border-t first:border-t-0 first:pt-0 pt-3 mt-3 first:mt-0" style={{ borderColor: 'var(--color-gray-700)' }}>
      <div className="text-[9px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-gray-400)' }}>
        {title}
      </div>
      {description ? (
        <div className="text-[10px] leading-snug mb-2" style={{ color: 'var(--color-gray-500)' }}>
          {description}
        </div>
      ) : null}
      {children}
    </div>
  )
}

/** Label column · ramp column — “No Data” solid; “Low / High” horizontal gradient line */
function RagTwoRowLegend({ noDataColor, gradientCss, rampLabel = 'Low / High' }) {
  return (
    <div
      className="w-full gap-y-2.5 gap-x-3 text-left"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(112px, 1fr)',
        alignItems: 'center',
      }}
    >
      <span className="text-[11px]" style={{ color: 'var(--color-gray-300)' }}>
        No Data
      </span>
      <span
        className="rounded-sm h-2.5 w-full min-h-[10px]"
        style={{
          backgroundColor: noDataColor,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        }}
        aria-hidden
      />
      <span className="text-[11px]" style={{ color: 'var(--color-gray-300)' }}>
        {rampLabel}
      </span>
      <div
        className="h-2 w-full rounded-sm"
        style={{
          background: gradientCss,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        }}
        aria-hidden
      />
    </div>
  )
}

export default function HeatHomelessnessLegend() {
  const {
    selectedCity,
    phoenixActiveMasterLayer,
    phoenixHeatIllnessesVisible,
    phoenixHeatDeathsVisible,
    phoenixHomelessnessVisible,
    phoenixHomelessnessAffectedNeighborhoodsVisible,
    phoenixHomelessnessCategoryEnabled,
    phoenixCoolingCentersVisible,
    phoenixCityServicesOverlayMode,
    callsForServiceStyle,
  } = usePanelContext()

  if (selectedCity !== 'phoenix' || phoenixActiveMasterLayer !== 'heat-homelessness') return null

  const showHeatIllness = phoenixHeatIllnessesVisible
  const showHeatDeaths = phoenixHeatDeathsVisible
  const showCoolingCenters = phoenixCoolingCentersVisible
  const showHomelessPoints = phoenixHomelessnessVisible
  const showHomelessNeighborRag = phoenixHomelessnessAffectedNeighborhoodsVisible
  const cityServicesOverlay = String(phoenixCityServicesOverlayMode || 'none')
  const showCityServicesOverlay = cityServicesOverlay !== 'none' && (showCoolingCenters || showHomelessPoints)

  if (!showHeatIllness && !showHeatDeaths && !showCoolingCenters && !showHomelessPoints && !showHomelessNeighborRag) {
    return null
  }

  const homelessnessView = String(callsForServiceStyle || 'default')
  const homelessViewExplanation =
    homelessnessView === 'heatmap'
      ? 'Heatmap density shows concentration; zoom in to see circles colored by category below.'
      : homelessnessView === 'cluster'
        ? 'Clusters summarize nearby points; unclustered markers use category colors.'
        : 'Markers use colors by service category below.'

  return (
    <DraggableFloatingPanel
      storageKey="phoenix:legend:heat-homelessness"
      defaultPosition={{ x: 80, y: 520 }}
      zIndex={50}
    >
      <div
        className="rounded-lg border shadow-xl overflow-hidden max-h-[72vh] overflow-y-auto"
        style={{
          backgroundColor: 'var(--sand-surface)',
          borderColor: 'var(--color-gray-700)',
          color: 'var(--color-gray-100)',
        }}
        role="region"
        aria-label="Heat and homelessness map legend"
      >
      <div className="px-2 py-1.5 border-b sticky top-0" style={{ backgroundColor: 'var(--sand-surface)', borderColor: 'var(--color-gray-700)' }}>
        <span className="text-[10px] font-semibold" style={{ color: 'var(--color-gray-200)' }}>
          Legend
        </span>
      </div>

      <div className="px-2.5 py-2.5 space-y-0">
        {showHeatIllness ? (
          <Section title="Heat Illnesses">
            <RagTwoRowLegend
              noDataColor={HEAT_ILLNESS.noData}
              gradientCss={heatIllnessCssGradient()}
              rampLabel="Density"
            />
          </Section>
        ) : null}

        {showCoolingCenters ? (
          <Section
            title="Cooling Centers"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <span
                  className="shrink-0 rounded-full"
                  style={{
                    width: 10,
                    height: 10,
                    backgroundColor: 'rgba(46, 185, 194, 0.95)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.2)',
                  }}
                  aria-hidden
                />
                <span className="text-[11px]" style={{ color: 'var(--color-gray-200)' }}>
                  Cooling center location
                </span>
              </div>
            </div>
          </Section>
        ) : null}

        {showCityServicesOverlay ? (
          <Section title="City Services (district overlay)">
            <RagTwoRowLegend
              noDataColor={'rgba(82,82,91,0.35)'}
              gradientCss={
                cityServicesOverlay === 'district_capacity'
                  ? 'linear-gradient(to right, rgba(34,197,94,0.45), rgba(245,158,11,0.45), rgba(239,68,68,0.45))'
                  : 'linear-gradient(to right, rgba(239,68,68,0.45), rgba(245,158,11,0.45), rgba(34,197,94,0.45))'
              }
              rampLabel={cityServicesOverlay === 'district_capacity' ? 'Low / High visits' : 'Low / High distribution'}
            />
          </Section>
        ) : null}

        {showHeatDeaths ? (
          <Section
            title="Heat-related deaths (neighborhood)"
            description="Estimated monthly totals per Phoenix village polygon. Colors deepen as modeled deaths rise for the scrubber month."
          >
            <RagTwoRowLegend
              noDataColor={HEAT_DEATHS_VILLAGE.gradient[0][1]}
              gradientCss={discreteGradientCss(HEAT_DEATHS_VILLAGE.gradient)}
            />
          </Section>
        ) : null}

        {showHomelessPoints ? (
          <Section title="Homelessness services">
            <div className="space-y-1.5">
              {HOMELESSNESS_CATEGORIES.map(({ label, color }) => {
                const enabled = phoenixHomelessnessCategoryEnabled?.[label] !== false
                return (
                  <div key={label} className="flex items-center gap-2.5">
                    <span
                      className="shrink-0 rounded-full"
                      style={{
                        width: 8,
                        height: 8,
                        backgroundColor: color,
                        opacity: enabled ? 1 : 0.35,
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.2)',
                      }}
                      aria-hidden
                    />
                    <span
                      className="text-[11px] font-medium"
                      style={{
                        color: enabled ? 'var(--color-gray-200)' : 'var(--color-gray-500)',
                        textDecoration: enabled ? undefined : 'line-through',
                      }}
                    >
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
          </Section>
        ) : null}

        {showHomelessNeighborRag ? (
          <Section
            title="Homelessness burden"
          >
            <RagTwoRowLegend
              noDataColor={HOMELESSNESS_NEIGHBORHOOD_RAG.gradient[0][1]}
              gradientCss={discreteGradientCss(HOMELESSNESS_NEIGHBORHOOD_RAG.gradient)}
            />
          </Section>
        ) : null}
      </div>
      </div>
    </DraggableFloatingPanel>
  )
}

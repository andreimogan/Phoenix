export type HeatAlertLevel = 'low' | 'moderate' | 'elevated' | 'severe' | 'extreme'
export type HeatRiskLevel = 'low' | 'moderate' | 'high' | 'very_high'
export type UtilityStressLevel = 'low' | 'moderate' | 'high'

export type DistrictRef =
  | string
  | {
      name: string
    }

export type HeatBriefingInput = {
  /** When the briefing was generated. Used only for display if present. */
  briefingDateISO?: string

  /** Severity of heat emergency posture. */
  alertLevel?: HeatAlertLevel

  /** Local time window for peak conditions, e.g. "14:00–18:00" */
  peakTimingLocal?: string

  /** Change vs prior briefing day (°C). */
  deltaVsYesterdayC?: number

  /** Forecast/now health burden risk category. */
  predictedHeatIllnessRisk?: HeatRiskLevel

  /** Weekly health/human impact signals (optional). */
  heatIllnessesThisWeek?: number
  heatDeathsThisWeek?: number

  /** Operational pressure signals. */
  coolingCapacityUsedPct?: number
  coolingCentersOpenCount?: number
  coolingVisitsThisWeek?: number

  /** Outreach progress signals. */
  outreachCompleted?: number
  outreachTarget?: number

  /** EMS pressure relative to baseline (%). */
  emsDeltaVsBaselinePct?: number

  /** Utility system stress signal. */
  utilityStress?: UtilityStressLevel

  /** Districts of concern (either by heat or risk). */
  hottestDistricts?: DistrictRef[]
  highestRiskDistricts?: DistrictRef[]
}

export type HeatBriefingOutput = {
  topLineSummaries: string[]
  keyDevelopments: string[]
  decisionRecommendations: string[]
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function normalizeDistrictNames(list: DistrictRef[] | undefined): string[] {
  const out: string[] = []
  for (const d of list || []) {
    const name = typeof d === 'string' ? d : d?.name
    const s = String(name || '').trim()
    if (!s) continue
    out.push(s)
  }
  return out
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of items) {
    const k = s.trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

function formatDistrictList(names: string[], max = 3): string | null {
  const picked = uniqueStrings(names).slice(0, max)
  if (!picked.length) return null
  if (picked.length === 1) return picked[0]
  if (picked.length === 2) return `${picked[0]} and ${picked[1]}`
  return `${picked[0]}, ${picked[1]}, and ${picked[2]}`
}

function pct(n: number): string {
  return `${Math.round(n)}%`
}

function ratio(completed?: number, target?: number): number | null {
  if (!isFiniteNumber(completed) || !isFiniteNumber(target) || target <= 0) return null
  return completed / target
}

function asAlertLabel(level: HeatAlertLevel): string {
  if (level === 'severe') return 'Severe'
  if (level === 'extreme') return 'Extreme'
  if (level === 'elevated') return 'Elevated'
  if (level === 'moderate') return 'Moderate'
  return 'Low'
}

export function buildHeatBriefing(input: HeatBriefingInput): HeatBriefingOutput {
  const topLineSummaries: string[] = []
  const keyDevelopments: string[] = []
  const decisionRecommendations: string[] = []

  const alertLevel = input.alertLevel
  const peakTiming = String(input.peakTimingLocal || '').trim()
  const illnessRisk = input.predictedHeatIllnessRisk
  const coolingUsedPct = input.coolingCapacityUsedPct
  const deltaC = input.deltaVsYesterdayC
  const emsDeltaPct = input.emsDeltaVsBaselinePct
  const outreachRatio = ratio(input.outreachCompleted, input.outreachTarget)
  const utilityStress = input.utilityStress

  const districts = uniqueStrings([
    ...normalizeDistrictNames(input.hottestDistricts),
    ...normalizeDistrictNames(input.highestRiskDistricts),
  ])
  const districtText = formatDistrictList(districts, 3)

  // ---- Top line summaries (1 sentence each; 3-4 total) ----
  // Rule: If alertLevel severe/extreme, first summary must mention citywide severity and peak timing.
  if ((alertLevel === 'severe' || alertLevel === 'extreme') && peakTiming) {
    topLineSummaries.push(
      `Citywide conditions are ${asAlertLabel(alertLevel).toLowerCase()} with peak heat expected ${peakTiming}.`
    )
  } else if (alertLevel === 'severe' || alertLevel === 'extreme') {
    topLineSummaries.push(`Citywide conditions are ${asAlertLabel(alertLevel).toLowerCase()} and require full response readiness.`)
  } else if (alertLevel) {
    topLineSummaries.push(`Citywide heat pressure is ${asAlertLabel(alertLevel).toLowerCase()} with continued risk to vulnerable residents.`)
  }

  // Rule: If predictedHeatIllnessRisk high/very_high, second summary must mention health burden.
  if ((illnessRisk === 'high' || illnessRisk === 'very_high')) {
    const illnesses = isFiniteNumber(input.heatIllnessesThisWeek) ? ` (${input.heatIllnessesThisWeek} illnesses this week)` : ''
    topLineSummaries.push(`Health burden is elevated with ${illnessRisk === 'very_high' ? 'very high' : 'high'} predicted heat illness risk${illnesses}.`)
  }

  // Rule: If emsDeltaVsBaselinePct > 20, include EMS strain in summaries or developments.
  if (isFiniteNumber(emsDeltaPct) && emsDeltaPct > 20) {
    topLineSummaries.push(`EMS demand is straining capacity at +${Math.round(emsDeltaPct)}% vs baseline; anticipate longer response times in hotspots.`)
  }

  if (districtText) {
    topLineSummaries.push(`Highest exposure and operational pressure are concentrated in ${districtText}.`)
  }

  // Ensure 3-4 summaries: if we have fewer, add a safe operational one using only known fields.
  if (topLineSummaries.length < 3) {
    if (isFiniteNumber(coolingUsedPct)) {
      topLineSummaries.push(`Cooling system utilization is at ${pct(coolingUsedPct)}; maintain surge capacity and staffing.`)
    } else {
      topLineSummaries.push('Maintain a proactive posture focused on vulnerable populations and operational continuity.')
    }
  }
  topLineSummaries.splice(4)

  // ---- Key developments (4-6 total) ----
  // Rule: If coolingCapacityUsedPct > 80 include capacity pressure.
  if (isFiniteNumber(coolingUsedPct) && coolingUsedPct > 80) {
    keyDevelopments.push(`Cooling centers are under pressure at ${pct(coolingUsedPct)} utilization; overflow planning is needed.`)
  }

  // Rule: deltaVsYesterdayC > 2 => worsened since prior briefing.
  if (isFiniteNumber(deltaC) && deltaC > 2) {
    keyDevelopments.push(`Conditions worsened since the prior briefing (up +${deltaC.toFixed(1)}°C vs yesterday).`)
  }

  if (peakTiming) {
    keyDevelopments.push(`Peak risk window is ${peakTiming}; focus resources on afternoon and early evening operations.`)
  }

  if ((illnessRisk === 'high' || illnessRisk === 'very_high')) {
    const deaths = isFiniteNumber(input.heatDeathsThisWeek) ? ` and ${input.heatDeathsThisWeek} heat deaths` : ''
    const illnesses = isFiniteNumber(input.heatIllnessesThisWeek) ? `${input.heatIllnessesThisWeek} heat illnesses` : null
    if (illnesses) keyDevelopments.push(`Weekly reporting shows ${illnesses}${deaths ? deaths : ''}, consistent with elevated health burden.`)
    else keyDevelopments.push('Health indicators remain elevated, with risk concentrated among older adults and unsheltered residents.')
  }

  if (districtText) {
    keyDevelopments.push(`District-level concentration is notable in ${districtText}; align outreach and EMS staging accordingly.`)
  }

  if (isFiniteNumber(emsDeltaPct) && emsDeltaPct > 20) {
    keyDevelopments.push(`EMS load is up +${Math.round(emsDeltaPct)}% vs baseline, increasing hospital handoff and transport pressure.`)
  }

  // Keep 4-6, omit gracefully if missing.
  keyDevelopments.splice(6)

  // ---- Decision recommendations (3-5 total; action verbs; threshold-aware) ----
  if ((alertLevel === 'severe' || alertLevel === 'extreme')) {
    decisionRecommendations.push('Escalate citywide heat response posture and confirm cross-department staffing coverage for peak hours.')
  }

  if (isFiniteNumber(coolingUsedPct) && coolingUsedPct > 80) {
    decisionRecommendations.push('Open overflow cooling capacity and extend cooling center hours ahead of the peak window.')
  }

  // Rule: outreachCompleted / outreachTarget < 0.85 => expand outreach recommendation.
  if (isFiniteNumber(outreachRatio) && outreachRatio < 0.85) {
    decisionRecommendations.push('Deploy additional outreach teams to close the gap on priority checks and ensure coverage for unsheltered residents.')
  }

  if (isFiniteNumber(emsDeltaPct) && emsDeltaPct > 20) {
    decisionRecommendations.push('Coordinate EMS and hospital surge plans; stage additional units in highest-demand districts during peak hours.')
  }

  // Rule: utilityStress high => utility coordination.
  if (utilityStress === 'high') {
    decisionRecommendations.push('Coordinate with utilities on grid stress and outage readiness; prioritize continuity for cooling and critical facilities.')
  }

  // Always include comms when risk is high and we have peak timing or severe posture.
  if ((alertLevel === 'severe' || alertLevel === 'extreme' || illnessRisk === 'high' || illnessRisk === 'very_high') && peakTiming) {
    decisionRecommendations.push(`Issue targeted public communications ahead of ${peakTiming} emphasizing hydration, cooling access, and welfare checks.`)
  } else if (alertLevel === 'severe' || alertLevel === 'extreme' || illnessRisk === 'high' || illnessRisk === 'very_high') {
    decisionRecommendations.push('Issue targeted public communications emphasizing hydration, cooling access, and welfare checks.')
  }

  // Keep to 3-5.
  decisionRecommendations.splice(5)

  // Ensure minimum counts without inventing values: use generic operational phrasing.
  while (keyDevelopments.length < 4) keyDevelopments.push('Operational posture remains focused on vulnerable populations and peak-hour readiness.')
  while (decisionRecommendations.length < 3) decisionRecommendations.push('Coordinate departments to sustain cooling access, outreach coverage, and emergency response readiness.')

  return {
    topLineSummaries: topLineSummaries.slice(0, 4),
    keyDevelopments: keyDevelopments.slice(0, 6),
    decisionRecommendations: decisionRecommendations.slice(0, 5),
  }
}


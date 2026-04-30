// Card order is intentional and is mirrored by `LeftNav.jsx` second-group nav items:
// 1) risk → 2) performance → 3) capital → 4) economic
const cityKPIData = {
  stl: [
    {
      id: 'risk',
      title: 'City Risk & Resilience',
      metric: '~20k',
      metricSuffix: 'residents at risk',
      description: 'within next 30 days if no action is taken',
      badge: { label: 'Intervention needed · Critical', variant: 'red' },
    },
    {
      id: 'performance',
      title: 'City Performance & Reliability',
      metric: '~22k',
      metricSuffix: 'residents impacted',
      description: 'by service & traffic failures (last 30 days)',
      badge: { label: 'Intervention needed · Critical', variant: 'red' },
    },
    {
      id: 'capital',
      title: 'Capital & Asset Stewardship',
      metric: '~$9M',
      metricSuffix: 'annual value loss',
      description: '12 public properties idle for 5+ years',
      badge: { label: 'Opportunity', variant: 'green' },
    },
    {
      id: 'economic',
      title: 'City Economic Health',
      metric: '~6k',
      metricSuffix: 'net residents out-migrated',
      description: 'over the last year eroding city income',
      badge: { label: 'Intervention needed · Critical', variant: 'red' },
    },
  ],

  baltimore: [
    {
      id: 'risk',
      title: 'City Risk & Resilience',
      metric: '~20k',
      metricSuffix: 'residents at risk',
      description: 'within next 30 days if no action is taken',
      badge: { label: 'Watch out · Critical priority', variant: 'yellow' },
    },
    {
      id: 'performance',
      title: 'City Performance & Reliability',
      metric: 'dynamic', // Will be calculated from 311 data
      metricSuffix: 'residents impacted',
      description: 'from currently open service requests',
      badge: { label: 'Intervention needed · Critical', variant: 'red' },
    },
    {
      id: 'capital',
      title: 'Capital & Asset Stewardship',
      metric: '~$9M',
      metricSuffix: 'annual value loss',
      description: '12 public properties idle for 5+ years',
      badge: { label: 'Opportunity', variant: 'green' },
    },
    {
      id: 'economic',
      title: 'City Economic Health',
      metric: '~6k',
      metricSuffix: 'net residents out-migrated',
      description: 'over the last year eroding city income',
      badge: { label: 'Watch out · Critical priority', variant: 'yellow' },
    },
  ],

  howard: [
    {
      id: 'risk',
      title: 'County Risk & Resilience',
      metric: '~12k',
      metricSuffix: 'residents at risk',
      description: 'from upcoming weather and infrastructure stress',
      badge: { label: 'Watch out', variant: 'yellow' },
    },
    {
      id: 'performance',
      title: 'County Performance & Reliability',
      metric: '~15k',
      metricSuffix: 'residents impacted',
      description: 'from infrastructure and service issues',
      badge: { label: 'Monitor', variant: 'yellow' },
    },
    {
      id: 'capital',
      title: 'Capital & Asset Stewardship',
      metric: '~$5M',
      metricSuffix: 'deferred maintenance',
      description: 'across 8 county facilities requiring attention',
      badge: { label: 'Action needed', variant: 'red' },
    },
    {
      id: 'economic',
      title: 'County Economic Health',
      metric: '+3k',
      metricSuffix: 'net residents in-migrated',
      description: 'over the last year contributing to growth',
      badge: { label: 'Positive trend', variant: 'green' },
    },
  ],

  // Phoenix card copy is illustrative — heat/homelessness framing for risk,
  // and made-up-but-plausible numbers for the others (no live datasets wired).
  phoenix: [
    {
      id: 'risk',
      title: 'City Risk & Resilience',
      // Computed in CityKPICards.jsx for Phoenix from:
      //   - phoenixHeatIllnessesSyntheticDemo (FORECAST_2026 rows, next 30 days)
      //   - phoenixHomelessnessSnapshot (Street Outreach cumulative served)
      metric: 'dynamic',
      metricSuffix: 'forecast heat cases',
      description: 'Linked to Phoenix Heat & Homelessness data',
      badge: { label: 'Intervention needed · Critical', variant: 'red' },
    },
    {
      id: 'performance',
      title: '311 Service Requests',
      metric: '~12.4k',
      metricSuffix: 'open requests',
      description: 'across Phoenix districts in the last 30 days',
      badge: { label: 'Trending up · Watch', variant: 'yellow' },
      placeholderTrendPercent: '12',
      placeholderTrendUp: true,
    },
    {
      id: 'capital',
      title: 'Housing & Affordability',
      metric: '+18%',
      metricSuffix: 'median rent YoY',
      description: '~38k households now rent-burdened citywide',
      badge: { label: 'Action needed · Critical', variant: 'red' },
      placeholderTrendPercent: '18',
      placeholderTrendUp: true,
    },
    {
      id: 'economic',
      title: 'District Economic Health',
      // Headline metric mirrors the Situational Awareness View "Top 1 — Biz
      // openings (90d)" district pick (see PHOENIX_SITUATIONAL_AWARENESS_FAKE).
      // CityKPICards.jsx overrides this dynamically when district fake data
      // changes so the card stays in lock-step with the map highlight.
      metric: '+5.1%',
      metricSuffix: 'biz openings · District 3',
      description: 'leading Phoenix districts over the last 90 days',
      badge: { label: 'Positive trend', variant: 'green' },
    },
  ],
}

export default cityKPIData

const cityKPIData = {
  stl: [
    {
      id: 'performance',
      title: 'City Performance & Reliability',
      metric: '~22k',
      metricSuffix: 'residents impacted',
      description: 'by service & traffic failures (last 30 days)',
      badge: { label: 'Intervention needed · Critical', variant: 'red' },
    },
    {
      id: 'risk',
      title: 'City Risk & Resilience',
      metric: '~20k',
      metricSuffix: 'residents at risk',
      description: 'within next 30 days if no action is taken',
      badge: { label: 'Intervention needed · Critical', variant: 'red' },
    },
    {
      id: 'economic',
      title: 'City Economic Health',
      metric: '~6k',
      metricSuffix: 'net residents out-migrated',
      description: 'over the last year eroding city income',
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
  ],

  baltimore: [
    {
      id: 'performance',
      title: 'City Performance & Reliability',
      metric: 'dynamic', // Will be calculated from 311 data
      metricSuffix: 'residents impacted',
      description: 'from currently open service requests',
      badge: { label: 'Intervention needed · Critical', variant: 'red' },
    },
    {
      id: 'risk',
      title: 'City Risk & Resilience',
      metric: '~20k',
      metricSuffix: 'residents at risk',
      description: 'within next 30 days if no action is taken',
      badge: { label: 'Watch out · Critical priority', variant: 'yellow' },
    },
    {
      id: 'economic',
      title: 'City Economic Health',
      metric: '~6k',
      metricSuffix: 'net residents out-migrated',
      description: 'over the last year eroding city income',
      badge: { label: 'Watch out · Critical priority', variant: 'yellow' },
    },
    {
      id: 'capital',
      title: 'Capital & Asset Stewardship',
      metric: '~$9M',
      metricSuffix: 'annual value loss',
      description: '12 public properties idle for 5+ years',
      badge: { label: 'Opportunity', variant: 'green' },
    },
  ],

  howard: [
    {
      id: 'performance',
      title: 'County Performance & Reliability',
      metric: '~15k',
      metricSuffix: 'residents impacted',
      description: 'from infrastructure and service issues',
      badge: { label: 'Monitor', variant: 'yellow' },
    },
    {
      id: 'risk',
      title: 'County Risk & Resilience',
      metric: '~12k',
      metricSuffix: 'residents at risk',
      description: 'from upcoming weather and infrastructure stress',
      badge: { label: 'Watch out', variant: 'yellow' },
    },
    {
      id: 'economic',
      title: 'County Economic Health',
      metric: '+3k',
      metricSuffix: 'net residents in-migrated',
      description: 'over the last year contributing to growth',
      badge: { label: 'Positive trend', variant: 'green' },
    },
    {
      id: 'capital',
      title: 'Capital & Asset Stewardship',
      metric: '~$5M',
      metricSuffix: 'deferred maintenance',
      description: 'across 8 county facilities requiring attention',
      badge: { label: 'Action needed', variant: 'red' },
    },
  ],

  // Placeholder metrics only — no Phoenix 311 dataset wired yet
  phoenix: [
    {
      id: 'performance',
      title: 'City Performance & Reliability',
      metric: '~5k',
      metricSuffix: 'residents impacted',
      description: 'from currently open service requests',
      badge: { label: 'Intervention needed · Critical', variant: 'red' },
      placeholderTrendPercent: '12',
      placeholderTrendUp: true,
    },
    {
      id: 'risk',
      title: 'City Risk & Resilience',
      metric: '~20k',
      metricSuffix: 'residents at risk',
      description: 'within next 30 days if no action is taken',
      badge: { label: 'Intervention needed · Critical', variant: 'red' },
    },
    {
      id: 'economic',
      title: 'City Economic Health',
      metric: 'TBD',
      metricSuffix: 'metrics pending',
      description: 'No Phoenix dataset connected yet.',
      badge: { label: 'Data pending', variant: 'yellow' },
    },
    {
      id: 'capital',
      title: 'Capital & Asset Stewardship',
      metric: 'TBD',
      metricSuffix: 'metrics pending',
      description: 'No Phoenix dataset connected yet.',
      badge: { label: 'Data pending', variant: 'yellow' },
    },
  ],
}

export default cityKPIData

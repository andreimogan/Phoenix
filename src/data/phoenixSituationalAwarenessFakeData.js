// Fake-but-stable picks for sub-layers 2/3/4 of the Situational Awareness View.
// Real data isn't wired for these signals yet, so these picks drive both the
// map highlights and the District Economic Health KPI card so they stay in sync.
export const PHOENIX_SITUATIONAL_AWARENESS_FAKE = {
  top311: {
    districtId: '5',
    label: '~1.2k open 311 (30d)',
    count: 1230,
  },
  topHousing: {
    districtId: '8',
    label: '+24% rent burden',
    percent: 24,
  },
  topEconBiz: {
    districtId: '3',
    label: '+5.1% biz openings (90d)',
    percent: 5.1,
  },
}

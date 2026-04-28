// Health data filter categories for overdose and naloxone data

export const OVERDOSE_FILTER_CATEGORIES = {
  substance: {
    id: 'substance',
    name: 'By Substance',
    options: [
      'Fentanyl',
      'Heroin',
      'Cocaine',
      'Methamphetamine',
      'Prescription Opioids',
      'Polysubstance',
    ],
  },
  outcome: {
    id: 'outcome',
    name: 'By Outcome',
    options: [
      'Fatal',
      'Hospitalized',
      'Survived',
    ],
  },
  ageGroup: {
    id: 'ageGroup',
    name: 'By Age Group',
    options: [
      '18-24',
      '25-34',
      '35-44',
      '45-54',
      '55-64',
      '65+',
    ],
  },
  race: {
    id: 'race',
    name: 'By Race/Ethnicity',
    options: [
      'Black/African American',
      'White',
      'Hispanic/Latino',
      'Other',
    ],
  },
  sex: {
    id: 'sex',
    name: 'By Sex',
    options: [
      'Male',
      'Female',
    ],
  },
}

export const NALOXONE_FILTER_CATEGORIES = {
  locationType: {
    id: 'locationType',
    name: 'By Location Type',
    options: [
      'Pharmacy',
      'Health Department',
      'Community Center',
      'Mobile Unit',
      'Outreach Event',
    ],
  },
}

// Helper to initialize all filters as enabled
export function initializeOverdoseFilters() {
  const filters = {}
  Object.values(OVERDOSE_FILTER_CATEGORIES).forEach(category => {
    category.options.forEach(option => {
      filters[`${category.id}:${option}`] = true
    })
  })
  return filters
}

export function initializeNaloxoneFilters() {
  const filters = {}
  Object.values(NALOXONE_FILTER_CATEGORIES).forEach(category => {
    category.options.forEach(option => {
      filters[`${category.id}:${option}`] = true
    })
  })
  return filters
}

// Extract category and value from filter key
export function parseFilterKey(filterKey) {
  const [category, value] = filterKey.split(':')
  return { category, value }
}

// Get filters grouped by category
export function getFiltersByCategory(filters, categories) {
  const grouped = {}
  
  Object.entries(categories).forEach(([catId, category]) => {
    grouped[catId] = {
      name: category.name,
      options: category.options.map(option => ({
        key: `${catId}:${option}`,
        label: option,
        enabled: filters[`${catId}:${option}`] ?? true,
      }))
    }
  })
  
  return grouped
}

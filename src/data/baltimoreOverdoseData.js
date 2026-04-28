// Baltimore Overdose Incidents Data (2022-2025)
// Sample data for demonstration purposes
// Geographic distribution based on Baltimore City neighborhoods

const BALTIMORE_NEIGHBORHOODS = [
  { name: 'Downtown', center: [-76.6122, 39.2904], weight: 1.2 },
  { name: 'Canton', center: [-76.5750, 39.2850], weight: 0.8 },
  { name: 'Fells Point', center: [-76.5930, 39.2830], weight: 0.9 },
  { name: 'Federal Hill', center: [-76.6100, 39.2750], weight: 0.7 },
  { name: 'West Baltimore', center: [-76.6450, 39.3000], weight: 2.5 },
  { name: 'East Baltimore', center: [-76.5700, 39.3050], weight: 2.3 },
  { name: 'Cherry Hill', center: [-76.6100, 39.2400], weight: 1.8 },
  { name: 'Park Heights', center: [-76.6700, 39.3400], weight: 2.1 },
  { name: 'Brooklyn', center: [-76.6200, 39.2300], weight: 1.5 },
  { name: 'Greenmount', center: [-76.6000, 39.3100], weight: 1.9 },
  { name: 'Waverly', center: [-76.6050, 39.3250], weight: 1.3 },
  { name: 'Patterson Park', center: [-76.5800, 39.2950], weight: 1.0 },
]

const SUBSTANCES = [
  { name: 'Fentanyl', weight: 60 },
  { name: 'Heroin', weight: 10 },
  { name: 'Cocaine', weight: 8 },
  { name: 'Methamphetamine', weight: 5 },
  { name: 'Prescription Opioids', weight: 7 },
  { name: 'Polysubstance', weight: 10 },
]

const AGE_GROUPS = [
  { range: '18-24', weight: 10 },
  { range: '25-34', weight: 35 },
  { range: '35-44', weight: 28 },
  { range: '45-54', weight: 18 },
  { range: '55-64', weight: 7 },
  { range: '65+', weight: 2 },
]

const RACES = [
  { name: 'Black/African American', weight: 58 },
  { name: 'White', weight: 35 },
  { name: 'Hispanic/Latino', weight: 4 },
  { name: 'Other', weight: 3 },
]

const SEXES = [
  { name: 'Male', weight: 70 },
  { name: 'Female', weight: 30 },
]

// Weighted random selection
function weightedRandom(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0)
  let random = Math.random() * totalWeight
  
  for (const item of items) {
    random -= item.weight
    if (random <= 0) return item
  }
  return items[0]
}

// Generate random coordinate near a center point
function randomNearby(center, maxOffsetDegrees = 0.02) {
  return [
    center[0] + (Math.random() - 0.5) * maxOffsetDegrees * 2,
    center[1] + (Math.random() - 0.5) * maxOffsetDegrees * 2,
  ]
}

// Generate overdose incidents for a given year
function generateOverdoseData(year, count) {
  const features = []
  const startDate = new Date(year, 0, 1).getTime()
  const endDate = new Date(year, 11, 31, 23, 59, 59).getTime()
  
  for (let i = 0; i < count; i++) {
    // Random date in the year (with seasonal variation - more in winter)
    const randomTime = startDate + Math.random() * (endDate - startDate)
    const date = new Date(randomTime)
    const month = date.getMonth()
    // Increase winter months (Nov-Feb) by 20%
    if ((month >= 10 || month <= 1) && Math.random() > 0.17) {
      date.setMonth(Math.floor(Math.random() * 2) + 11) // Nov or Dec
    }
    
    const neighborhood = weightedRandom(BALTIMORE_NEIGHBORHOODS)
    const substance = weightedRandom(SUBSTANCES)
    const ageGroup = weightedRandom(AGE_GROUPS)
    const race = weightedRandom(RACES)
    const sex = weightedRandom(SEXES)
    
    // Fatal vs nonfatal (roughly 30% fatal rate)
    const isFatal = Math.random() < 0.30
    const naloxoneGiven = Math.random() < 0.65 // 65% receive naloxone
    
    // Outcome based on naloxone and fatality
    let outcome
    if (isFatal) {
      outcome = 'Fatal'
    } else if (naloxoneGiven && Math.random() < 0.7) {
      outcome = 'Survived'
    } else {
      outcome = 'Hospitalized'
    }
    
    // Response time
    const responseRand = Math.random()
    let responseTime
    if (responseRand < 0.4) responseTime = '< 5 min'
    else if (responseRand < 0.75) responseTime = '5-10 min'
    else responseTime = '10+ min'
    
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: randomNearby(neighborhood.center),
      },
      properties: {
        incidentId: `OD-${year}-${String(i + 1).padStart(5, '0')}`,
        incidentDate: date.getTime(),
        incidentType: isFatal ? 'fatal' : 'nonfatal',
        substance: substance.name,
        naloxoneAdministered: naloxoneGiven,
        ageGroup: ageGroup.range,
        race: race.name,
        sex: sex.name,
        neighborhood: neighborhood.name,
        outcome: outcome,
        responseTime: responseTime,
      },
    })
  }
  
  // Sort by date
  features.sort((a, b) => a.properties.incidentDate - b.properties.incidentDate)
  
  return {
    type: 'FeatureCollection',
    features,
  }
}

// Generate data for all years
const overdoseData = {
  2022: generateOverdoseData(2022, 520),
  2023: generateOverdoseData(2023, 580),
  2024: generateOverdoseData(2024, 650),
  2025: generateOverdoseData(2025, 420), // Partial year
}

export default overdoseData

// Baltimore Naloxone Distribution Data (2022-2025)
// Sample data for demonstration purposes
// Represents naloxone kit distribution sites and events

const DISTRIBUTION_LOCATIONS = [
  { name: 'CVS Pharmacy - Downtown', coords: [-76.6140, 39.2900], type: 'Pharmacy', recurring: true, weight: 3 },
  { name: 'Walgreens - Canton', coords: [-76.5770, 39.2830], type: 'Pharmacy', recurring: true, weight: 2 },
  { name: 'Rite Aid - Fells Point', coords: [-76.5910, 39.2840], type: 'Pharmacy', recurring: true, weight: 2 },
  { name: 'CVS Pharmacy - Federal Hill', coords: [-76.6090, 39.2760], type: 'Pharmacy', recurring: true, weight: 2 },
  { name: 'Baltimore City Health Dept - Main', coords: [-76.6200, 39.3050], type: 'Health Department', recurring: true, weight: 4 },
  { name: 'Helping Up Mission', coords: [-76.6030, 39.2980], type: 'Community Center', recurring: true, weight: 3 },
  { name: 'Behavioral Health System Baltimore', coords: [-76.6150, 39.2980], type: 'Community Center', recurring: true, weight: 3 },
  { name: 'Chase Brexton Health Care', coords: [-76.6170, 39.3030], type: 'Health Department', recurring: true, weight: 2 },
  { name: 'Mobile Outreach Unit - West', coords: [-76.6480, 39.3020], type: 'Mobile Unit', recurring: false, weight: 2 },
  { name: 'Mobile Outreach Unit - East', coords: [-76.5720, 39.3070], type: 'Mobile Unit', recurring: false, weight: 2 },
  { name: 'Penn North Community Center', coords: [-76.6380, 39.3120], type: 'Community Center', recurring: true, weight: 2 },
  { name: 'Cherry Hill Community', coords: [-76.6120, 39.2420], type: 'Community Center', recurring: true, weight: 2 },
  { name: 'Park Heights Wellness Center', coords: [-76.6720, 39.3420], type: 'Community Center', recurring: true, weight: 2 },
  { name: 'Johns Hopkins Outreach', coords: [-76.5950, 39.2970], type: 'Health Department', recurring: true, weight: 3 },
  { name: 'University of MD Mobile Clinic', coords: [-76.6230, 39.2850], type: 'Mobile Unit', recurring: false, weight: 2 },
]

const ORGANIZATIONS = [
  'Baltimore City Health Department',
  'Behavioral Health System Baltimore',
  'Maryland Department of Health',
  'Johns Hopkins Medicine',
  'University of Maryland Medical System',
  'Local Community Partners',
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

// Generate random coordinate with small offset
function jitterCoords(coords, offset = 0.001) {
  return [
    coords[0] + (Math.random() - 0.5) * offset * 2,
    coords[1] + (Math.random() - 0.5) * offset * 2,
  ]
}

// Generate naloxone distribution events for a given year
function generateNaloxoneData(year, eventsPerYear) {
  const features = []
  const startDate = new Date(year, 0, 1).getTime()
  const endDate = new Date(year, 11, 31, 23, 59, 59).getTime()
  
  // For recurring sites, generate monthly distributions
  DISTRIBUTION_LOCATIONS.forEach(location => {
    if (location.recurring) {
      // Generate 12 monthly events (one per month)
      for (let month = 0; month < 12; month++) {
        // Skip future months in current year
        if (year === 2025 && month > 2) continue
        
        // Random day in month
        const dayInMonth = 1 + Math.floor(Math.random() * 28)
        const date = new Date(year, month, dayInMonth, Math.floor(Math.random() * 12) + 8, Math.floor(Math.random() * 60))
        
        // Kits distributed varies by location type
        let kitsDistributed
        if (location.type === 'Health Department') {
          kitsDistributed = Math.floor(Math.random() * 150) + 100 // 100-250
        } else if (location.type === 'Pharmacy') {
          kitsDistributed = Math.floor(Math.random() * 80) + 40 // 40-120
        } else if (location.type === 'Community Center') {
          kitsDistributed = Math.floor(Math.random() * 100) + 50 // 50-150
        } else {
          kitsDistributed = Math.floor(Math.random() * 60) + 20 // 20-80
        }
        
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: jitterCoords(location.coords, 0.0005),
          },
          properties: {
            distributionId: `NAL-${year}-${String(features.length + 1).padStart(5, '0')}`,
            distributionDate: date.getTime(),
            locationType: location.type,
            locationName: location.name,
            kitsDistributed: kitsDistributed,
            address: `${Math.floor(Math.random() * 3000) + 100} Street Name`,
            neighborhood: location.name.split(' - ')[1] || location.name.split(' ')[0],
            organizationName: ORGANIZATIONS[Math.floor(Math.random() * ORGANIZATIONS.length)],
            recurring: location.recurring,
          },
        })
      }
    }
  })
  
  // Add one-time outreach events
  const oneTimeEvents = Math.floor(eventsPerYear * 0.3) // 30% are one-time events
  for (let i = 0; i < oneTimeEvents; i++) {
    const randomTime = startDate + Math.random() * (endDate - startDate)
    const date = new Date(randomTime)
    
    // Skip future dates in 2025
    if (year === 2025 && date > new Date('2025-03-31')) continue
    
    const location = weightedRandom(DISTRIBUTION_LOCATIONS)
    const kitsDistributed = Math.floor(Math.random() * 200) + 50 // 50-250
    
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: jitterCoords(location.coords, 0.015),
      },
      properties: {
        distributionId: `NAL-${year}-${String(features.length + 1).padStart(5, '0')}`,
        distributionDate: date.getTime(),
        locationType: 'Outreach Event',
        locationName: `Community Outreach - ${location.name.split(' - ')[0]}`,
        kitsDistributed: kitsDistributed,
        address: `${Math.floor(Math.random() * 3000) + 100} Street Name`,
        neighborhood: location.name.split(' - ')[1] || location.name.split(' ')[0],
        organizationName: ORGANIZATIONS[Math.floor(Math.random() * ORGANIZATIONS.length)],
        recurring: false,
      },
    })
  }
  
  // Sort by date
  features.sort((a, b) => a.properties.distributionDate - b.properties.distributionDate)
  
  return {
    type: 'FeatureCollection',
    features,
  }
}

// Generate data for all years
const naloxoneData = {
  2022: generateNaloxoneData(2022, 280),
  2023: generateNaloxoneData(2023, 320),
  2024: generateNaloxoneData(2024, 380),
  2025: generateNaloxoneData(2025, 100), // Partial year (Jan-Mar)
}

export default naloxoneData

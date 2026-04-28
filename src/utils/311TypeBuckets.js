// Bucket definitions for Baltimore 311 Service Request types
export const BUCKET_DEFINITIONS = {
  sanitation: {
    id: 'sanitation',
    name: 'Sanitation & Trash',
    keywords: ['trash', 'waste', 'dump', 'bulk', 'dirty', 'graffiti', 'litter', 'clean', 'rat abatement', 'sanitation'],
  },
  housing: {
    id: 'housing',
    name: 'Housing & Property',
    keywords: ['hcd', 'inspect', 'vacant', 'building', 'exterior', 'weed', 'structural', 'code', 'property', 'housing'],
  },
  streets: {
    id: 'streets',
    name: 'Streets & Sidewalks',
    keywords: ['pothole', 'street', 'road', 'traffic', 'sign', 'signal', 'crosswalk', 'streetlight', 'sidewalk', 'trm-', 'dot-'],
  },
  water: {
    id: 'water',
    name: 'Water, Sewer & Stormwater',
    keywords: ['water', 'sewer', 'storm', 'main', 'leak', 'backup', 'inlet', 'manhole', 'dpw-water', 'dpw-sewer'],
  },
  parks: {
    id: 'parks',
    name: 'Parks, Trees & Greenspace',
    keywords: ['tree', 'park', 'playground', 'green', 'bcrp-', 'forestry'],
  },
  animals: {
    id: 'animals',
    name: 'Animals & Pests',
    keywords: ['animal', 'dead animal', 'rat', 'pest', 'wildlife'],
  },
  vehicles: {
    id: 'vehicles',
    name: 'Vehicles & Transportation',
    keywords: ['vehicle', 'car', 'parking', 'abandoned', 'tow', 'blocked', 'snow', 'ice'],
  },
  safety: {
    id: 'safety',
    name: 'Public Safety & Enforcement',
    keywords: ['noise', 'nuisance', 'enforcement', 'complaint', 'violation'],
  },
  facilities: {
    id: 'facilities',
    name: 'City Facilities & Admin',
    keywords: ['city facility', 'building maintenance', 'information', '311 app', 'website'],
  },
}

// Categorize an SRType into a bucket
export function categorizeSRType(srType) {
  if (!srType) return 'other'
  const lower = srType.toLowerCase()
  
  for (const [bucketId, bucket] of Object.entries(BUCKET_DEFINITIONS)) {
    if (bucket.keywords.some(kw => lower.includes(kw))) {
      return bucketId
    }
  }
  
  return 'other'
}

// Group types by bucket
export function groupTypesByBucket(srTypes) {
  const buckets = { other: [] }
  
  // Initialize all defined buckets
  Object.keys(BUCKET_DEFINITIONS).forEach(id => { buckets[id] = [] })
  
  srTypes.forEach(type => {
    const bucket = categorizeSRType(type)
    buckets[bucket].push(type)
  })
  
  // Remove empty buckets
  return Object.fromEntries(
    Object.entries(buckets).filter(([_, types]) => types.length > 0)
  )
}

// Calculate statistics for top affected neighborhoods

/**
 * Calculate centroid (center point) of a polygon or multipolygon
 */
function calculateCentroid(geometry) {
  if (!geometry) return null

  let coordinates = []
  
  if (geometry.type === 'Polygon') {
    coordinates = geometry.coordinates[0] // Use outer ring
  } else if (geometry.type === 'MultiPolygon') {
    // Use the largest polygon's outer ring
    const largestPolygon = geometry.coordinates.reduce((largest, current) => {
      return current[0].length > largest[0].length ? current : largest
    })
    coordinates = largestPolygon[0]
  } else {
    return null
  }

  // Calculate average of all points
  let sumLng = 0
  let sumLat = 0
  coordinates.forEach(([lng, lat]) => {
    sumLng += lng
    sumLat += lat
  })

  return [sumLng / coordinates.length, sumLat / coordinates.length]
}

/**
 * Check if a point is inside a polygon (same as neighborhoodDensity.js)
 */
function isPointInPolygon(point, geometry) {
  if (!geometry) return false

  if (geometry.type === 'Polygon') {
    return pointInPolygonRings(point, geometry.coordinates)
  } else if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some(rings => pointInPolygonRings(point, rings))
  }
  
  return false
}

function pointInPolygonRings(point, rings) {
  const [lng, lat] = point
  const outerRing = rings[0]
  
  if (!isPointInRing(lng, lat, outerRing)) {
    return false
  }
  
  for (let i = 1; i < rings.length; i++) {
    if (isPointInRing(lng, lat, rings[i])) {
      return false
    }
  }
  
  return true
}

function isPointInRing(lng, lat, ring) {
  let inside = false
  
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)
    
    if (intersect) inside = !inside
  }
  
  return inside
}

/**
 * Get color tier for a neighborhood based on density ratio
 */
function getColorTier(count, maxCount) {
  if (count === 0 || maxCount === 0) return 'none'
  
  const ratio = count / maxCount
  
  if (ratio >= 0.7) return 'red'
  if (ratio >= 0.5) return 'orange'
  if (ratio >= 0.3) return 'amber'
  if (ratio >= 0.15) return 'yellow'
  return 'gray'
}

/**
 * Get top N neighborhoods by 311 density with detailed statistics
 * @param {Object} densityMap - Map of neighborhood name to open request count
 * @param {Object} neighborhoodsGeoJSON - GeoJSON with neighborhood polygons
 * @param {Object} baltimore311Data - Full 311 GeoJSON (already filtered by enabled types)
 * @param {Object} options - { hideClosed, topN }
 * @returns {Array} Array of neighborhood stats objects
 */
export function getTopNeighborhoods(densityMap, neighborhoodsGeoJSON, baltimore311Data, options = {}) {
  const { hideClosed = false, topN = 4 } = options
  
  if (!densityMap || !neighborhoodsGeoJSON || !baltimore311Data) {
    return []
  }

  const maxCount = Math.max(...Object.values(densityMap), 1)
  
  // Sort neighborhoods by density (descending)
  const sorted = Object.entries(densityMap)
    .filter(([name, count]) => count > 0) // Only neighborhoods with requests
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
  
  // Calculate detailed stats for each top neighborhood
  return sorted.map(([name, count]) => {
    // Find the neighborhood feature
    const neighborhoodFeature = neighborhoodsGeoJSON.features.find(
      f => f.properties.Name === name
    )
    
    if (!neighborhoodFeature) return null
    
    // Calculate centroid for marker positioning
    const centroid = calculateCentroid(neighborhoodFeature.geometry)
    
    // Get all 311 requests within this neighborhood
    const requestsInNeighborhood = baltimore311Data.features.filter(request => {
      if (!request.geometry || request.geometry.type !== 'Point') return false
      
      // Skip closed if needed
      if (hideClosed && request.properties.CloseDate) return false
      
      const [lng, lat] = request.geometry.coordinates
      return isPointInPolygon([lng, lat], neighborhoodFeature.geometry)
    })
    
    // Count by type to get top 3
    const typeCounts = {}
    requestsInNeighborhood.forEach(req => {
      const type = req.properties.SRType
      if (type) {
        typeCounts[type] = (typeCounts[type] || 0) + 1
      }
    })
    
    const topTypes = Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([type, typeCount]) => ({ type, count: typeCount }))
    
    // Estimate affected residents (rough approximation)
    // Baltimore population ~600k, ~278 neighborhoods = ~2,150 per neighborhood average
    // Scale by density to estimate impact
    const avgResidentsPerNeighborhood = 2150
    const estimatedResidents = Math.round(avgResidentsPerNeighborhood * (count / maxCount) * 1.5)
    
    return {
      name,
      count,
      residents: estimatedResidents,
      topTypes,
      centroid,
      color: getColorTier(count, maxCount)
    }
  }).filter(Boolean)
}

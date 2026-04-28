// Calculate 311 service request density for each neighborhood

/**
 * Calculate the number of open 311 requests within each neighborhood
 * @param {Object} neighborhoodsGeoJSON - GeoJSON with neighborhood polygons
 * @param {Object} requests311GeoJSON - GeoJSON with 311 request points
 * @param {boolean} hideClosedRequests - Whether to exclude closed requests
 * @returns {Object} Map of neighborhood name to open request count
 */
export function calculateNeighborhood311Density(
  neighborhoodsGeoJSON,
  requests311GeoJSON,
  hideClosedRequests = false
) {
  if (!neighborhoodsGeoJSON || !requests311GeoJSON) {
    return {}
  }

  const densityMap = {}

  // Initialize all neighborhoods with 0 count
  neighborhoodsGeoJSON.features.forEach(neighborhood => {
    const name = neighborhood.properties.Name
    if (name) {
      densityMap[name] = 0
    }
  })

  // Count open requests in each neighborhood
  requests311GeoJSON.features.forEach(request => {
    // Skip if not a valid point
    if (!request.geometry || request.geometry.type !== 'Point') return
    
    // Skip closed requests if hideClosedRequests is true
    if (hideClosedRequests && request.properties.StatusDate) return
    
    const [lng, lat] = request.geometry.coordinates
    if (!lng || !lat) return

    // Find which neighborhood contains this point
    for (const neighborhood of neighborhoodsGeoJSON.features) {
      if (isPointInPolygon([lng, lat], neighborhood.geometry)) {
        const name = neighborhood.properties.Name
        if (name) {
          densityMap[name] = (densityMap[name] || 0) + 1
        }
        break // Point can only be in one neighborhood
      }
    }
  })

  return densityMap
}

/**
 * Check if a point is inside a polygon or multipolygon
 * Uses ray casting algorithm
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
  // Check if point is in outer ring and not in any holes
  const [lng, lat] = point
  const outerRing = rings[0]
  
  if (!isPointInRing(lng, lat, outerRing)) {
    return false
  }
  
  // Check holes (if any)
  for (let i = 1; i < rings.length; i++) {
    if (isPointInRing(lng, lat, rings[i])) {
      return false // Point is in a hole
    }
  }
  
  return true
}

/**
 * Ray casting algorithm to check if point is inside a ring
 */
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
 * Get a color based on 311 request density
 * Returns a color from gray (low) -> yellow -> orange -> red (high)
 */
export function getDensityColor(count, maxCount) {
  if (count === 0 || maxCount === 0) {
    return 'rgba(156, 163, 175, 0.15)' // Very light gray for zero
  }
  
  const ratio = count / maxCount
  
  if (ratio < 0.15) {
    return 'rgba(156, 163, 175, 0.3)' // Light gray
  } else if (ratio < 0.3) {
    return 'rgba(253, 224, 71, 0.4)' // Yellow
  } else if (ratio < 0.5) {
    return 'rgba(251, 191, 36, 0.5)' // Amber
  } else if (ratio < 0.7) {
    return 'rgba(249, 115, 22, 0.6)' // Orange
  } else {
    return 'rgba(239, 68, 68, 0.7)' // Red
  }
}

/**
 * Create a MapLibre/Mapbox expression for neighborhood fill color based on density
 */
export function getNeighborhoodColorExpression(densityMap) {
  if (!densityMap || Object.keys(densityMap).length === 0) {
    return 'rgba(59, 130, 246, 0.12)' // Default blue
  }

  const maxCount = Math.max(...Object.values(densityMap), 1)
  
  // Build a match expression: ['match', ['get', 'Name'], neighborhood1, color1, neighborhood2, color2, ..., defaultColor]
  const expression = ['match', ['get', 'Name']]
  
  Object.entries(densityMap).forEach(([name, count]) => {
    expression.push(name)
    expression.push(getDensityColor(count, maxCount))
  })
  
  // Default color (if name not found)
  expression.push('rgba(59, 130, 246, 0.12)')
  
  return expression
}

/**
 * Create a MapLibre/Mapbox expression for neighborhood border color based on density
 */
export function getNeighborhoodBorderExpression(densityMap) {
  if (!densityMap || Object.keys(densityMap).length === 0) {
    return 'rgb(59, 130, 246)' // Default blue
  }

  const maxCount = Math.max(...Object.values(densityMap), 1)
  
  const expression = ['match', ['get', 'Name']]
  
  Object.entries(densityMap).forEach(([name, count]) => {
    const ratio = count / maxCount
    
    let borderColor
    if (count === 0 || ratio < 0.15) {
      borderColor = 'rgb(156, 163, 175)' // Gray
    } else if (ratio < 0.3) {
      borderColor = 'rgb(253, 224, 71)' // Yellow
    } else if (ratio < 0.5) {
      borderColor = 'rgb(251, 191, 36)' // Amber
    } else if (ratio < 0.7) {
      borderColor = 'rgb(249, 115, 22)' // Orange
    } else {
      borderColor = 'rgb(239, 68, 68)' // Red
    }
    
    expression.push(name)
    expression.push(borderColor)
  })
  
  // Default border
  expression.push('rgb(59, 130, 246)')
  
  return expression
}

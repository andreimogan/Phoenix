const STORAGE_KEY = 'neighborhoodRiskPolygons'

const EMPTY_COLLECTION = {
  type: 'FeatureCollection',
  features: []
}

export function getNeighborhoodRiskData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_COLLECTION
    const parsed = JSON.parse(raw)
    if (parsed && parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
      return parsed
    }
    return EMPTY_COLLECTION
  } catch (error) {
    console.warn('Invalid neighborhood risk data in localStorage, clearing...')
    localStorage.removeItem(STORAGE_KEY) // Clear invalid data
    return EMPTY_COLLECTION
  }
}

export function saveNeighborhoodRiskData(featureCollection) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(featureCollection))
  } catch (error) {
    console.error('Error saving neighborhood risk polygons:', error)
  }
}

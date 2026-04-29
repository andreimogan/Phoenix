// Map view presets per city and engine
// These camera positions are applied when switching cities or map engines

export const VIEW_PRESETS = {
  stl: {
    maplibre: {
      center: [-90.1994, 38.6270],
      zoom: 11,
      pitch: 0,
      bearing: 0
    },
    mapbox: {
      center: [-90.1994, 38.6270],
      zoom: 11,
      pitch: 0,
      bearing: 0
    }
  },
  baltimore: {
    maplibre: {
      center: [-76.6188, 39.2913],
      zoom: 15,
      pitch: 54,
      bearing: 18
    },
    mapbox: {
      center: [-76.6188, 39.2913],
      zoom: 15,
      pitch: 54,
      bearing: 18
    }
  },
  howard: {
    maplibre: {
      center: [-76.8758, 39.2037],
      zoom: 11,
      pitch: 0,
      bearing: 0
    },
    mapbox: {
      center: [-76.8758, 39.2037],
      zoom: 11,
      pitch: 0,
      bearing: 0
    }
  },
  phoenix: {
    maplibre: {
      center: [-112.0740, 33.4484],
      zoom: 9.5,
      pitch: 0,
      bearing: 0
    },
    mapbox: {
      center: [-112.0740, 33.4484],
      zoom: 9.5,
      pitch: 0,
      bearing: 0
    }
  }
}

// Get view preset for a specific city and engine
export const getViewPreset = (city, engine) => {
  return VIEW_PRESETS[city]?.[engine] || null
}

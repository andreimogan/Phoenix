import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Cloud, CloudMoon, CloudRain, CloudSun, Droplets, Eye, Wind } from 'lucide-react'
import { usePanelContext } from '../../contexts/PanelContext'

const CITY_COORDS = {
  baltimore: { latitude: 39.2904, longitude: -76.6122, label: 'Baltimore' },
  stl: { latitude: 38.627, longitude: -90.1994, label: 'St. Louis' },
  howard: { latitude: 39.2673, longitude: -76.7983, label: 'Howard County' },
  phoenix: { latitude: 33.4484, longitude: -112.074, label: 'Phoenix' },
}

const HOURLY_FIELDS = [
  'temperature_2m',
  'cloud_cover',
  'visibility',
  'wind_speed_10m',
  'wind_gusts_10m',
  'precipitation_probability',
  'precipitation',
  'rain',
]

function average(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getPeriodSummary(rows) {
  if (!rows.length) {
    return {
      minTemp: 0,
      maxTemp: 0,
      avgCloud: 0,
      precipMm: 0,
      rainMm: 0,
      maxPrecipProb: 0,
      avgVisibilityKm: 0,
      maxWindKmh: 0,
      maxGustKmh: 0,
    }
  }

  const temperatures = rows.map((row) => row.temperature_2m)
  const cloud = rows.map((row) => row.cloud_cover)
  const visibilityKm = rows.map((row) => row.visibility / 1000)
  const wind = rows.map((row) => row.wind_speed_10m)
  const gust = rows.map((row) => row.wind_gusts_10m)
  const precip = rows.map((row) => row.precipitation)
  const rain = rows.map((row) => row.rain)
  const precipProb = rows.map((row) => row.precipitation_probability)

  return {
    minTemp: Math.round(Math.min(...temperatures)),
    maxTemp: Math.round(Math.max(...temperatures)),
    avgCloud: Math.round(average(cloud)),
    precipMm: Number(precip.reduce((sum, value) => sum + value, 0).toFixed(1)),
    rainMm: Number(rain.reduce((sum, value) => sum + value, 0).toFixed(1)),
    maxPrecipProb: Math.round(Math.max(...precipProb)),
    avgVisibilityKm: Number(average(visibilityKm).toFixed(1)),
    maxWindKmh: Math.round(Math.max(...wind)),
    maxGustKmh: Math.round(Math.max(...gust)),
  }
}

function getCondition(summary) {
  if (summary.rainMm >= 1.5 || summary.maxPrecipProb >= 55) {
    return {
      label: 'Rain likely',
      Icon: CloudRain,
      accent: '#4cc9ff',
      chipBackground: 'rgba(76, 201, 255, 0.14)',
      chipBorder: 'rgba(76, 201, 255, 0.3)',
    }
  }
  if (summary.avgCloud >= 75) {
    return {
      label: 'Mostly cloudy',
      Icon: Cloud,
      accent: '#a8b7cf',
      chipBackground: 'rgba(168, 183, 207, 0.12)',
      chipBorder: 'rgba(168, 183, 207, 0.28)',
    }
  }
  return {
    label: 'Partly clear',
    Icon: CloudSun,
    accent: '#f2b84b',
    chipBackground: 'rgba(242, 184, 75, 0.14)',
    chipBorder: 'rgba(242, 184, 75, 0.3)',
  }
}

function buildRows(hourly) {
  const time = hourly?.time || []
  return time.map((slot, index) => ({
    time: slot,
    temperature_2m: hourly.temperature_2m?.[index] ?? 0,
    cloud_cover: hourly.cloud_cover?.[index] ?? 0,
    visibility: hourly.visibility?.[index] ?? 0,
    wind_speed_10m: hourly.wind_speed_10m?.[index] ?? 0,
    wind_gusts_10m: hourly.wind_gusts_10m?.[index] ?? 0,
    precipitation_probability: hourly.precipitation_probability?.[index] ?? 0,
    precipitation: hourly.precipitation?.[index] ?? 0,
    rain: hourly.rain?.[index] ?? 0,
  }))
}

export default function WeatherInfoWindow() {
  const { selectedCity, rightWindowsCollapsed, toggleRightWindowCollapsed } = usePanelContext()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [weatherData, setWeatherData] = useState(null)
  const isCollapsed = !!rightWindowsCollapsed?.weather

  useEffect(() => {
    let cancelled = false
    const coords = CITY_COORDS[selectedCity] || CITY_COORDS.baltimore

    const loadWeather = async () => {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
        hourly: HOURLY_FIELDS.join(','),
      })

      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
        if (!response.ok) throw new Error(`Weather request failed (${response.status})`)
        const payload = await response.json()
        if (!cancelled) setWeatherData(payload)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load weather data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadWeather()
    const refreshId = setInterval(loadWeather, 10 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(refreshId)
    }
  }, [selectedCity])

  const derived = useMemo(() => {
    const rows = buildRows(weatherData?.hourly)
    if (!rows.length) return null

    const nowMs = Date.now()
    const todayRows = rows.filter((row) => {
      const ts = new Date(row.time).getTime()
      return ts >= nowMs && ts <= nowMs + 12 * 60 * 60 * 1000
    })
    const tonightRows = rows.filter((row) => {
      const ts = new Date(row.time).getTime()
      return ts > nowMs + 12 * 60 * 60 * 1000 && ts <= nowMs + 24 * 60 * 60 * 1000
    })

    const current = rows.find((row) => new Date(row.time).getTime() >= nowMs) || rows[0]
    const today = getPeriodSummary(todayRows)
    const tonight = getPeriodSummary(tonightRows)
    const condition = getCondition(today)
    const city = CITY_COORDS[selectedCity] || CITY_COORDS.baltimore

    return {
      cityLabel: city.label,
      currentTemp: Math.round(current.temperature_2m),
      today,
      tonight,
      condition,
    }
  }, [weatherData, selectedCity])

  return (
    <div
      className="weather-overlay-shell"
      style={{
        width: '360px',
        pointerEvents: 'auto',
      }}
      aria-label="Weather information"
    >
      <div className="weather-overlay-surface border rounded-[10px] flex flex-col gap-1" style={{ borderColor: 'var(--color-gray-700)' }}>
        <div className="w-full flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4" style={{ color: '#4cc9ff' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>
              Weather information
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md h-7 w-7"
            style={{ color: 'rgba(255,255,255,0.75)' }}
            title={isCollapsed ? 'Expand' : 'Minimize'}
            onClick={() => toggleRightWindowCollapsed('weather')}
          >
            <ChevronDown
              className="w-4 h-4 transition-transform"
              style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
              aria-hidden="true"
            />
          </button>
        </div>

        {!isCollapsed && (
        <div className="px-3 pb-3">
          <div className="border-t pt-3" style={{ borderColor: 'var(--color-gray-700)' }}>
            {loading && (
              <div className="text-xs px-3 py-3 rounded-md" style={{ color: 'var(--color-gray-400)', background: 'rgba(255,255,255,0.03)' }}>
                Loading weather data...
              </div>
            )}

            {!loading && error && (
              <div
                className="text-xs px-3 py-3 rounded-md border"
                style={{
                  color: '#ffb0b0',
                  background: 'rgba(140, 44, 44, 0.2)',
                  borderColor: 'rgba(255, 142, 142, 0.26)',
                }}
              >
                {error}
              </div>
            )}

            {!loading && !error && derived && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-gray-400)' }}>
                      {derived.cityLabel}
                    </p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>
                      Current: {derived.currentTemp}C
                    </p>
                  </div>
                  <div
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold"
                    style={{
                      color: derived.condition.accent,
                      background: derived.condition.chipBackground,
                      borderColor: derived.condition.chipBorder,
                    }}
                  >
                    <derived.condition.Icon className="w-3.5 h-3.5" />
                    {derived.condition.label}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <section className="rounded-[8px] border px-2.5 py-2" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-semibold" style={{ color: 'var(--color-gray-200)' }}>
                        Today
                      </p>
                      <CloudSun className="w-4 h-4" style={{ color: '#f2b84b' }} />
                    </div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>
                      {derived.today.minTemp} - {derived.today.maxTemp}C
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-gray-400)' }}>
                      Cloud {derived.today.avgCloud}%
                    </p>
                  </section>

                  <section className="rounded-[8px] border px-2.5 py-2" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-semibold" style={{ color: 'var(--color-gray-200)' }}>
                        Tonight
                      </p>
                      <CloudMoon className="w-4 h-4" style={{ color: '#91a0b8' }} />
                    </div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>
                      {derived.tonight.minTemp} - {derived.tonight.maxTemp}C
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-gray-400)' }}>
                      Cloud {derived.tonight.avgCloud}%
                    </p>
                  </section>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <div className="rounded-[8px] px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="flex items-center gap-1">
                      <Droplets className="w-3.5 h-3.5" style={{ color: '#4cc9ff' }} />
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--color-gray-100)' }}>
                        {derived.today.maxPrecipProb}%
                      </span>
                    </div>
                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-gray-500)' }}>
                      Rain chance
                    </p>
                  </div>

                  <div className="rounded-[8px] px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" style={{ color: '#b7c6dd' }} />
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--color-gray-100)' }}>
                        {derived.today.avgVisibilityKm} km
                      </span>
                    </div>
                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-gray-500)' }}>
                      Visibility
                    </p>
                  </div>

                  <div className="rounded-[8px] px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="flex items-center gap-1">
                      <Wind className="w-3.5 h-3.5" style={{ color: '#b7c6dd' }} />
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--color-gray-100)' }}>
                        {derived.today.maxGustKmh}
                      </span>
                    </div>
                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-gray-500)' }}>
                      Gust km/h
                    </p>
                  </div>
                </div>

                {(derived.today.rainMm >= 1.5 || derived.today.maxPrecipProb >= 55) && (
                  <div
                    className="flex items-center gap-2 rounded-[8px] border px-2.5 py-2"
                    style={{
                      borderColor: 'rgba(76, 201, 255, 0.3)',
                      background: 'rgba(76, 201, 255, 0.12)',
                      color: '#7fdcff',
                    }}
                  >
                    <CloudRain className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-semibold">
                      Rain impact elevated today. Prioritize drainage and road condition monitoring.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  )
}


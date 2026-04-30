import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  Circle,
  Cloud,
  CloudMoon,
  CloudRain,
  CloudSun,
  Home,
  Building2,
  Bug,
  Car,
  Droplets,
  Eye,
  Shield,
  Trash2,
  Trees,
  Wind,
  Wrench,
} from 'lucide-react'
import { usePanelContext } from '../contexts/PanelContext'
import { BUCKET_DEFINITIONS, categorizeSRType } from '../utils/311TypeBuckets'
import { generatePerformanceModalData } from '../utils/performanceAnalytics'

const CITY_COORDS = {
  baltimore: { latitude: 39.2904, longitude: -76.6122, label: 'Baltimore' },
  stl: { latitude: 38.627, longitude: -90.1994, label: 'St. Louis' },
  howard: { latitude: 39.2673, longitude: -76.7983, label: 'Howard County' },
  phoenix: { latitude: 33.4484, longitude: -112.074, label: 'Phoenix' },
}

/** UI-only samples when Phoenix 311 is not connected */
const PHOENIX_PLACEHOLDER_311_ROWS = [
  { id: 'phx-1', srType: 'Streetlight outage (sample)', timeLabel: 'Sample · no live feed' },
  { id: 'phx-2', srType: 'Alley bulk pickup (sample)', timeLabel: 'Sample · no live feed' },
  { id: 'phx-3', srType: 'Hydrant inspection (sample)', timeLabel: 'Sample · no live feed' },
]

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
      tone: 'warn',
      Icon: CloudRain,
      accent: '#4cc9ff',
      chipBackground: 'rgba(76, 201, 255, 0.14)',
      chipBorder: 'rgba(76, 201, 255, 0.3)',
    }
  }
  if (summary.avgCloud >= 75) {
    return {
      label: 'Mostly cloudy',
      tone: 'muted',
      Icon: Cloud,
      accent: '#a8b7cf',
      chipBackground: 'rgba(168, 183, 207, 0.12)',
      chipBorder: 'rgba(168, 183, 207, 0.28)',
    }
  }
  return {
    label: 'Partly clear',
    tone: 'calm',
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

export default function WeatherAccordion() {
  const {
    selectedCity,
    selectedDate,
    baltimore311Data,
    healthOverdoseData,
    currentView,
    setCurrentView,
    requestMapFocus,
    requestMapPopup,
    setCopilotVisible,
    setActiveTab,
    setChatMessages,
    phoenixWeatherWindowVisible,
    phoenixLatest311WindowVisible,
    phoenixInterventionWindowVisible,
  } = usePanelContext()
  // Each section is now its own window; keep content expanded.
  const weatherOpen = true
  const cityInfoOpen = true
  const interventionOpen = true
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [weatherData, setWeatherData] = useState(null)

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
        if (!response.ok) {
          throw new Error(`Weather request failed (${response.status})`)
        }
        const payload = await response.json()
        if (!cancelled) setWeatherData(payload)
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load weather data')
        }
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

  const latestOpenRequests = useMemo(() => {
    if (!baltimore311Data?.features?.length || selectedCity !== 'baltimore') return []

    const asOf = new Date(selectedDate)
    asOf.setHours(23, 59, 59, 999)
    const asOfTime = asOf.getTime()

    return baltimore311Data.features
      .filter((feature) => {
        const created = feature?.properties?.CreatedDate
        const closed = feature?.properties?.CloseDate
        if (!created || created > asOfTime) return false
        return !closed || closed > asOfTime
      })
      .sort((a, b) => (b?.properties?.CreatedDate || 0) - (a?.properties?.CreatedDate || 0))
      .slice(0, 5)
  }, [baltimore311Data, selectedCity, selectedDate])

  const immediateIntervention = useMemo(() => {
    if (selectedCity === 'phoenix') {
      return {
        title: 'Urban heat & roadway stress — pilot corridor (placeholder)',
        description:
          'Sample priority narrative only. Connect Phoenix 311 and health datasets to replace this with live recommendations.',
        createdAt: selectedDate,
        locationHint: 'Planning grid · Central Phoenix (illustrative)',
      }
    }
    if (selectedCity !== 'baltimore' || !baltimore311Data) return null
    const perf = generatePerformanceModalData(selectedDate, baltimore311Data, healthOverdoseData)
    if (!perf?.recommendation) return null

    return {
      title: perf.recommendation.title || 'Service Response Acceleration',
      description: perf.recommendation.description || 'Prioritized intervention required.',
      createdAt: selectedDate,
      locationHint: perf?._debug?.topNeighborhoods?.[0]?.name || 'City Priority Zone',
    }
  }, [selectedCity, selectedDate, baltimore311Data, healthOverdoseData])

  const getBucketIcon = (bucketId) => {
    switch (bucketId) {
      case 'sanitation':
        return Trash2
      case 'housing':
        return Home
      case 'streets':
        return Wrench
      case 'water':
        return Droplets
      case 'parks':
        return Trees
      case 'animals':
        return Bug
      case 'vehicles':
        return Car
      case 'safety':
        return Shield
      case 'facilities':
        return Building2
      default:
        return Circle
    }
  }

  const formatRequestTime = (timestamp) => {
    if (!timestamp) return 'Unknown time'
    const date = new Date(timestamp)
    const now = Date.now()
    const diffHours = Math.floor((now - date.getTime()) / (1000 * 60 * 60))

    if (diffHours < 1) return 'Less than 1h ago'
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const handleAnalyze311Request = (request) => {
    const props = request?.properties || {}
    const srType = props.SRType || 'Service Request'
    const locationHint = props.Neighborhood || props.Address || 'City Priority Zone'
    const detail = props.SRStatus ? `Status: ${props.SRStatus}` : 'Open 311 request requires triage.'

    const planMessage = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      type: 'action-plan-context',
      timestamp: new Date(),
      context: {
        title: `311 Response Plan: ${srType}`,
        description: `${detail} ${props.Agency ? `Agency: ${props.Agency}.` : ''}`.trim(),
        locationHint,
        workOrderStrategy: 'single',
        steps: [
          { id: 'step-1', text: `Assign initial triage owner for ${srType}`, source: 'recommended' },
          { id: 'step-2', text: `Validate on-site conditions at ${locationHint}`, source: 'recommended' },
          { id: 'step-3', text: 'Define response scope, crew, and equipment', source: 'recommended' },
          { id: 'step-4', text: 'Publish ETA and monitor closure progress', source: 'recommended' },
        ],
      },
      removedStepIds: [],
      customSteps: [],
      approvedAction: false,
    }

    setCopilotVisible(true)
    setActiveTab('chat')
    setChatMessages((prev) => [...prev, planMessage])
  }

  const handleGoToRequestOnMap = (request) => {
    const coords = request?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) return

    const props = request?.properties || {}
    const lng = coords[0]
    const lat = coords[1]

    setCurrentView('map')
    requestMapFocus({ lng, lat, zoom: 15 })
    requestMapPopup({
      lng,
      lat,
      properties: {
        SRType: props.SRType || 'Service Request',
        Address: props.Address || '',
        SRStatus: props.SRStatus || '',
        CreatedDate: props.CreatedDate || null,
        CloseDate: props.CloseDate || null,
        Agency: props.Agency || '',
        Neighborhood: props.Neighborhood || '',
      },
    })
  }

  const handleAnalyzeImmediateIntervention = () => {
    if (!immediateIntervention) return

    const planMessage = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      type: 'action-plan-context',
      timestamp: new Date(),
      context: {
        title: immediateIntervention.title,
        description: immediateIntervention.description,
        locationHint: immediateIntervention.locationHint,
        steps: [
          { id: 'step-1', text: 'Dispatch priority response crew to highest-impact zone', source: 'recommended' },
          { id: 'step-2', text: 'Validate root cause and isolate affected infrastructure', source: 'recommended' },
          { id: 'step-3', text: 'Coordinate traffic/safety controls for field operations', source: 'recommended' },
          { id: 'step-4', text: 'Issue resident communication and service restoration timeline', source: 'recommended' },
        ],
      },
      removedStepIds: [],
      customSteps: [],
      approvedAction: false,
    }

    setCopilotVisible(true)
    setActiveTab('chat')
    setChatMessages((prev) => [...prev, planMessage])
  }

  if (currentView === 'performance') return null

  return (
    <>
      {phoenixWeatherWindowVisible && (
        <aside
          className="fixed weather-overlay-shell"
          style={{
            top: '84px',
            right: '16px',
            width: '360px',
            zIndex: 40,
          }}
        >
          <div className="weather-overlay-surface border rounded-[10px] flex flex-col gap-1" style={{ borderColor: 'var(--color-gray-700)' }}>
            <div className="w-full flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4" style={{ color: '#4cc9ff' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>Weather information</span>
              </div>
            </div>
            {weatherOpen && (
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
                  <section
                    className="rounded-[8px] border px-2.5 py-2"
                    style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-semibold" style={{ color: 'var(--color-gray-200)' }}>Today</p>
                      <CloudSun className="w-4 h-4" style={{ color: '#f2b84b' }} />
                    </div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>
                      {derived.today.minTemp} - {derived.today.maxTemp}C
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-gray-400)' }}>
                      Cloud {derived.today.avgCloud}%
                    </p>
                  </section>

                  <section
                    className="rounded-[8px] border px-2.5 py-2"
                    style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-semibold" style={{ color: 'var(--color-gray-200)' }}>Tonight</p>
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
                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-gray-500)' }}>Rain chance</p>
                  </div>

                  <div className="rounded-[8px] px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" style={{ color: '#b7c6dd' }} />
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--color-gray-100)' }}>
                        {derived.today.avgVisibilityKm} km
                      </span>
                    </div>
                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-gray-500)' }}>Visibility</p>
                  </div>

                  <div className="rounded-[8px] px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="flex items-center gap-1">
                      <Wind className="w-3.5 h-3.5" style={{ color: '#b7c6dd' }} />
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--color-gray-100)' }}>
                        {derived.today.maxGustKmh}
                      </span>
                    </div>
                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-gray-500)' }}>Gust km/h</p>
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
        </aside>
      )}

      {phoenixLatest311WindowVisible && (
        <aside
          className="fixed weather-overlay-shell"
          style={{
            top: phoenixWeatherWindowVisible ? '364px' : '84px',
            right: '16px',
            width: '360px',
            zIndex: 40,
          }}
        >
          <div className="weather-overlay-surface border rounded-[10px] flex flex-col gap-1" style={{ borderColor: 'var(--color-gray-700)' }}>
            <div className="w-full flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" style={{ color: '#4cc9ff' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>Latest 311 Service Requests</span>
              </div>
            </div>
            {cityInfoOpen && (
              <div className="px-3 pb-2">
            <div className="border-t pt-2 flex flex-col gap-1.5" style={{ borderColor: 'var(--color-gray-700)' }}>
            <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
              Latest 5 open 311 requests
            </p>

            {selectedCity !== 'baltimore' && selectedCity !== 'phoenix' && (
              <div
                className="text-xs px-3 py-2 rounded-md border"
                style={{
                  color: 'var(--color-gray-400)',
                  borderColor: 'var(--color-gray-700)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                311 request feed is currently configured for Baltimore dataset.
              </div>
            )}

            {selectedCity === 'phoenix' && (
              <>
                <p className="text-[11px] mb-1.5" style={{ color: 'var(--color-gray-500)' }}>
                  Illustrative rows only — Phoenix 311 is not connected yet.
                </p>
                {PHOENIX_PLACEHOLDER_311_ROWS.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-[8px] border px-2 py-1.5 weather-overlay-soft-card"
                    style={{
                      borderColor: 'var(--color-gray-700)',
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div
                          className="w-6 h-6 rounded-md border flex items-center justify-center shrink-0"
                          style={{ borderColor: 'rgba(76, 201, 255, 0.2)', background: 'rgba(76, 201, 255, 0.08)' }}
                        >
                          <Circle className="w-3 h-3" style={{ color: 'var(--color-gray-500)' }} />
                        </div>
                        <div className="min-w-0">
                          <span
                            className="text-[11px] font-semibold truncate block text-left max-w-[175px]"
                            style={{ color: 'var(--color-gray-400)' }}
                          >
                            {row.srType}
                          </span>
                          <span className="text-[9px] block" style={{ color: 'var(--color-gray-500)' }}>
                            {row.timeLabel}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--color-gray-600)' }}>
                        Preview
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}

            {selectedCity === 'baltimore' && latestOpenRequests.length === 0 && (
              <div
                className="text-xs px-3 py-2 rounded-md border"
                style={{
                  color: 'var(--color-gray-400)',
                  borderColor: 'var(--color-gray-700)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                No open requests available for the selected date.
              </div>
            )}

              {selectedCity === 'baltimore' && latestOpenRequests.map((request, index) => {
              const srType = request?.properties?.SRType || 'Service Request'
              const created = request?.properties?.CreatedDate
              const bucketId = categorizeSRType(srType)
              const BucketIcon = getBucketIcon(bucketId)

              return (
                <div
                  key={`${srType}-${created || index}`}
                  className="rounded-[8px] border px-2 py-1.5 weather-overlay-soft-card"
                  style={{
                    borderColor: 'var(--color-gray-700)',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className="w-6 h-6 rounded-md border flex items-center justify-center shrink-0"
                        style={{ borderColor: 'rgba(76, 201, 255, 0.28)', background: 'rgba(76, 201, 255, 0.12)' }}
                      >
                        <BucketIcon className="w-3 h-3" style={{ color: '#4cc9ff' }} />
                      </div>
                      <div className="min-w-0">
                        <button
                          type="button"
                          className="text-[11px] font-semibold truncate block text-left underline-offset-2 max-w-[175px]"
                          style={{ color: 'var(--color-gray-100)' }}
                          onClick={() => handleGoToRequestOnMap(request)}
                          title="Go to map"
                        >
                          {srType}
                        </button>
                        <span className="text-[9px] block" style={{ color: 'var(--color-gray-500)' }}>
                          {formatRequestTime(created)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-[10px] underline underline-offset-2"
                      style={{ color: 'var(--sand-teal)' }}
                      onClick={() => handleAnalyze311Request(request)}
                    >
                      AI Analyze Steps
                    </button>
                  </div>
                </div>
              )
              })}
              </div>
            </div>
            )}
          </div>
        </aside>
      )}

      {phoenixInterventionWindowVisible && (
        <aside
          className="fixed weather-overlay-shell"
          style={{
            top: phoenixWeatherWindowVisible
              ? (phoenixLatest311WindowVisible ? '650px' : '364px')
              : (phoenixLatest311WindowVisible ? '364px' : '84px'),
            right: '16px',
            width: '360px',
            zIndex: 40,
          }}
        >
          <div className="weather-overlay-surface border rounded-[10px] flex flex-col gap-1" style={{ borderColor: 'var(--color-gray-700)' }}>
            <div className="w-full flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" style={{ color: '#fca5a5' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--color-gray-100)' }}>Immediate Intervention Needed</span>
              </div>
            </div>
            {interventionOpen && (
              <div className="px-3 pb-2">
              <div className="border-t pt-2 flex flex-col gap-1.5" style={{ borderColor: 'var(--color-gray-700)' }}>
                <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
                  Priority operational step
                </p>

                {!immediateIntervention && selectedCity !== 'phoenix' && (
                  <div
                    className="text-xs px-3 py-2 rounded-md border"
                    style={{
                      color: 'var(--color-gray-400)',
                      borderColor: 'var(--color-gray-700)',
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    No immediate intervention recommendation available.
                  </div>
                )}

                {immediateIntervention && (
                  <div
                    className="rounded-[8px] border px-2 py-1.5 weather-overlay-soft-card"
                    style={{
                      borderColor: 'var(--color-gray-700)',
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div
                          className="w-6 h-6 rounded-md border flex items-center justify-center shrink-0"
                          style={{ borderColor: 'rgba(252,165,165,0.35)', background: 'rgba(220,38,38,0.14)' }}
                        >
                          <AlertTriangle className="w-3 h-3" style={{ color: '#fca5a5' }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold truncate block text-left max-w-[175px]" style={{ color: 'var(--color-gray-100)' }}>
                            {immediateIntervention.title}
                          </p>
                          <span className="text-[9px] block" style={{ color: 'var(--color-gray-500)' }}>
                            {formatRequestTime(immediateIntervention.createdAt)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-[10px] underline underline-offset-2"
                        style={{ color: 'var(--sand-teal)' }}
                        onClick={handleAnalyzeImmediateIntervention}
                      >
                        AI Analyze Steps
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        </aside>
      )}
    </>
  )
}

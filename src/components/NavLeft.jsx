import { MapPin, ChevronDown, Calendar } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { usePanelContext } from '../contexts/PanelContext'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import phoenixHeatIllnessesSyntheticDemo from '../data/phoenixHeatIllnessesSyntheticDemo.json'

const CITIES = [
  {
    id: 'phoenix',
    label: 'Phoenix, AZ',
    title: 'City of Phoenix Intelligence Center',
    subtitle: "Mayor's Decision Cockpit",
    logo: '/vite.svg',
  },
]

const YEARS = [2023, 2024, 2025]

const MS_DAY = 24 * 60 * 60 * 1000

const isSameUtcDay = (a, b) => (
  a && b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()
)

export default function NavLeft() {
  const {
    selectedCity, setSelectedCity,
    selectedDate, setSelectedDate,
    selectedYear, setSelectedYear,
    phoenixCallsForServiceMaxDate,
    phoenixHeatIllnessesVisible,
    phoenixHeatIllnessesTimeMode,
    phoenixTemperatureNeighborhoodsVisible,
    phoenixCoolingCentersVisible,
    phoenixCoolingCentersTimeMode,
    phoenixHomelessnessVisible,
    phoenixHomelessnessTimeMode,
    activeActionTab,
  } = usePanelContext()
  const [cityOpen, setCityOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const cityData = CITIES.find(c => c.id === selectedCity) || CITIES[0]

  // Force Phoenix-only in this build.
  useEffect(() => {
    if (selectedCity !== 'phoenix') setSelectedCity('phoenix')
  }, [selectedCity, setSelectedCity])

  // Sync selectedYear when selectedDate changes
  useEffect(() => {
    const year = selectedDate.getFullYear()
    if (year !== selectedYear) {
      setSelectedYear(year)
    }
  }, [selectedDate, selectedYear, setSelectedYear])

  const handleCitySelect = (cityId) => {
    setSelectedCity(cityId)
    setCityOpen(false)
  }

  const formatDisplayDate = (date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Heat illness week buckets — used by the calendar to show
  // Historical / Present / Forecast / No data captions when
  // the Heat Illnesses sub-layer is on.
  const heatIllnessWeekBuckets = useMemo(() => {
    const historical = new Set()
    const forecast = new Set()
    let forecastMaxStartIso = null
    for (const r of phoenixHeatIllnessesSyntheticDemo?.rows || []) {
      const ws = r?.Week_Start
      if (!ws) continue
      const dt = String(r?.Data_Type || '').trim()
      if (dt === 'HISTORICAL') historical.add(ws)
      else if (dt === 'FORECAST_2026') {
        forecast.add(ws)
        if (!forecastMaxStartIso || ws > forecastMaxStartIso) forecastMaxStartIso = ws
      }
    }
    let forecastEndDate = null
    if (forecastMaxStartIso) {
      const startMs = Date.parse(forecastMaxStartIso + 'T00:00:00Z')
      if (Number.isFinite(startMs)) forecastEndDate = new Date(startMs + 6 * MS_DAY)
    }
    return { historical, forecast, forecastEndDate }
  }, [])

  const classifyHeatIllnessDate = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
    const today = new Date()
    if (isSameUtcDay(date, today)) return 'present'
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const dayMs = Date.parse(ymd + 'T00:00:00Z')
    if (!Number.isFinite(dayMs)) return null
    const findBucket = (set) => {
      for (const ws of set) {
        const startMs = Date.parse(ws + 'T00:00:00Z')
        if (!Number.isFinite(startMs)) continue
        if (dayMs >= startMs && dayMs <= startMs + 6 * MS_DAY) return true
      }
      return false
    }
    if (findBucket(heatIllnessWeekBuckets.historical)) return 'historical'
    if (findBucket(heatIllnessWeekBuckets.forecast)) return 'forecast'
    return 'no-data'
  }

  const getMaxSelectableDate = () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    // When viewing aggregated historical Heat Illness data, prevent selecting future dates.
    if (
      selectedCity === 'phoenix' &&
      phoenixHeatIllnessesVisible &&
      String(phoenixHeatIllnessesTimeMode || 'current') === 'all_historical'
    ) {
      return today
    }
    if (selectedCity === 'phoenix' && phoenixHeatIllnessesVisible && heatIllnessWeekBuckets.forecastEndDate) {
      return heatIllnessWeekBuckets.forecastEndDate
    }
    // Temperature: allow looking up to 16 days ahead when the layer is on.
    if (selectedCity === 'phoenix' && phoenixTemperatureNeighborhoodsVisible) {
      const max = new Date(today)
      max.setDate(max.getDate() + 16)
      return max
    }
    // Alerts: allow looking up to 16 days ahead while Allerts is active.
    if (selectedCity === 'phoenix' && activeActionTab === 'alerts') {
      const max = new Date(today)
      max.setDate(max.getDate() + 16)
      return max
    }
    // City services (Cooling Centers / Homelessness): allow selecting up to 16 days ahead
    // when either service is in Current Time.
    if (
      selectedCity === 'phoenix' && (
        (phoenixCoolingCentersVisible && String(phoenixCoolingCentersTimeMode || 'all_historical') === 'current') ||
        (phoenixHomelessnessVisible && String(phoenixHomelessnessTimeMode || 'all_historical') === 'current')
      )
    ) {
      const max = new Date(today)
      max.setDate(max.getDate() + 16)
      return max
    }
    if (selectedCity === 'phoenix' && phoenixCallsForServiceMaxDate instanceof Date) {
      // Never cap the calendar *before today* due to Calls for Service.
      // (Otherwise "today" looks out-of-range when CFS data is behind.)
      return phoenixCallsForServiceMaxDate.getTime() > today.getTime() ? phoenixCallsForServiceMaxDate : today
    }
    return today
  }

  const maxSelectableDate = getMaxSelectableDate()
  const minSelectableDate = new Date('2023-01-01T00:00:00')

  const showHeatIllnessCalendarAnnotations =
    selectedCity === 'phoenix' &&
    !!phoenixHeatIllnessesVisible &&
    String(phoenixHeatIllnessesTimeMode || 'current') === 'current'

  const showTemperatureCalendarAnnotations =
    selectedCity === 'phoenix' &&
    !!phoenixTemperatureNeighborhoodsVisible

  const showAnnotatedCalendar =
    showHeatIllnessCalendarAnnotations || showTemperatureCalendarAnnotations

  // Temperature data window (matches Temperature layer in MapView).
  const TEMP_MIN_DATE = new Date('2024-01-01T00:00:00')

  const classifyTemperatureDate = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
    if (d0.getTime() < TEMP_MIN_DATE.getTime()) return 'no-data'
    const cmp = d0.getTime() - today.getTime()
    if (cmp === 0) return 'present'
    if (cmp > 0) {
      const max = new Date(today)
      max.setDate(max.getDate() + 16)
      return d0.getTime() <= max.getTime() ? 'forecast' : 'no-data'
    }
    return 'historical'
  }

  const controlStyle = {
    color: 'var(--color-gray-100)',
    background: 'var(--nav-button-bg)',
    borderColor: 'var(--border-subtle)',
  }

  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div className="flex items-center gap-2 px-2 shrink-0">
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
          style={{ background: '#171717' }}
        >
          <img src={cityData.logo} alt={`${cityData.title} logo`} className="w-4 h-4 object-contain" />
        </div>
        <div className="leading-none">
          <p className="text-sm font-semibold text-white">{cityData.title}</p>
          <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
            {cityData.subtitle}
          </p>
        </div>
      </div>

      {/* City selector */}
      <div className="relative">
        <button
          className="flex items-center gap-2 h-9 px-3 rounded-[8px] text-sm transition-colors border"
          style={controlStyle}
          title="Location"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--nav-button-active-bg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--nav-button-bg)' }}
          onClick={() => { /* Phoenix-only: no dropdown */ }}
        >
          <MapPin className="w-4 h-4" aria-hidden="true" />
          <span className="font-normal">{cityData.label}</span>
          <ChevronDown className="w-4 h-4 opacity-40" aria-hidden="true" />
        </button>
      </div>

      {/* Date selector */}
      <div className="relative">
        <button
          className="flex items-center gap-2 h-9 px-3 rounded-[8px] text-sm transition-colors border"
          style={controlStyle}
          title="Select date"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--nav-button-active-bg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--nav-button-bg)' }}
          onClick={() => { setDateOpen(!dateOpen); setCityOpen(false) }}
        >
          <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="font-normal">{formatDisplayDate(selectedDate)}</span>
          <ChevronDown
            className="w-4 h-4 transition-transform opacity-60"
            style={{ transform: dateOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            aria-hidden="true"
          />
        </button>
        {dateOpen && (
          <div
            className="absolute mt-1 rounded-[16px] border shadow-lg z-[90] overflow-hidden p-3"
            style={{
              background: 'var(--sand-surface)',
              borderColor: 'var(--color-gray-700)',
              boxShadow: '0 18px 40px rgba(0,0,0,0.45), 0 10px 18px rgba(0,0,0,0.25)',
            }}
          >
            <DayPicker
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate}
              onSelect={(d) => {
                if (!d) return
                if (d < minSelectableDate || d > maxSelectableDate) return
                setSelectedDate(d)
                setDateOpen(false)
              }}
              numberOfMonths={1}
              captionLayout="dropdown"
              fromYear={minSelectableDate.getFullYear()}
              toYear={maxSelectableDate.getFullYear()}
              disabled={{ before: minSelectableDate, after: maxSelectableDate }}
              className={`text-[var(--color-gray-100)] ${showAnnotatedCalendar ? '[--cell-size:48px]' : '[--cell-size:32px]'}`}
              classNames={{
                months: 'flex flex-col',
                month: 'space-y-2',
                caption: 'relative flex items-center justify-center',
                caption_label: 'sr-only',
                nav: 'w-full flex items-center justify-between',
                nav_button:
                  'h-8 w-8 inline-flex items-center justify-center rounded-md text-[var(--color-gray-200)] hover:bg-[var(--color-gray-800)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gray-600)]',
                dropdown:
                  'h-[34px] bg-[var(--background)] border border-[var(--color-gray-700)] rounded-md px-2 py-1 text-[var(--color-gray-100)] text-sm shadow-[0_1px_2px_rgba(0,0,0,0.35)]',
                dropdown_month: '',
                dropdown_year: '',
                table: 'w-full border-collapse',
                head_row: 'flex',
                head_cell: 'w-[--cell-size] text-[12px] font-normal text-[var(--color-gray-400)] flex items-center justify-center h-[21px]',
                row: 'flex w-full mt-1',
                cell: 'w-[--cell-size] h-[--cell-size] p-0 flex items-center justify-center',
                day: 'w-[--cell-size] h-[--cell-size] rounded-md text-[14px] text-[var(--color-gray-100)] hover:bg-[var(--color-gray-800)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gray-600)]',
                day_selected: 'bg-[var(--sand-teal)] text-[var(--sand-dark)] hover:bg-[var(--sand-teal-light)]',
                day_today: 'border border-[var(--sand-teal)]',
                day_outside: 'text-[var(--color-gray-500)]',
                day_disabled: 'text-[var(--color-gray-600)] opacity-60',
              }}
              formatters={{
                formatMonthDropdown: (date) => date.toLocaleString('default', { month: 'short' }),
              }}
              components={showAnnotatedCalendar ? {
                DayButton: ({ day, modifiers, className, children, ...buttonProps }) => {
                  const cls = showHeatIllnessCalendarAnnotations
                    ? classifyHeatIllnessDate(day?.date)
                    : classifyTemperatureDate(day?.date)

                  const labelText =
                    cls === 'present' ? 'P' :
                    cls === 'historical' ? 'H' :
                    cls === 'forecast' ? 'F' :
                    null

                  const labelColor =
                    cls === 'present' ? 'var(--sand-teal)' :
                    cls === 'historical' ? 'var(--color-gray-400)' :
                    cls === 'forecast' ? 'rgba(234,179,8,0.85)' :
                    'var(--color-gray-600)'

                  const isSelected = !!modifiers?.selected
                  const dayNum = day?.date instanceof Date ? day.date.getDate() : children
                  return (
                    <button {...buttonProps} className={className}>
                      <span className="flex flex-col items-center justify-center w-full h-full leading-none">
                        <span className="text-[14px]">{dayNum}</span>
                        {labelText ? (
                          <span
                            className="mt-0.5 text-[8px] uppercase tracking-wide font-medium"
                            style={{ color: isSelected ? 'var(--sand-dark)' : labelColor }}
                          >
                            {labelText}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  )
                },
              } : undefined}
            />
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useMemo, useRef } from 'react'
import { Card, CardHeader, CardTitle } from './ui/card'
import { cn } from '../lib/utils'
import { usePanelContext } from '../contexts/PanelContext'
import cityKPIData from '../data/cityKPIData'
import PerformanceDetailModal from './PerformanceDetailModal'
import { generatePerformanceModalData } from '../utils/performanceAnalytics'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'

const badgeStyles = {
  red: {
    bg: 'rgba(220, 38, 38, 0.15)',
    border: 'rgba(220, 38, 38, 0.5)',
    text: '#fca5a5',
  },
  yellow: {
    bg: 'rgba(202, 138, 4, 0.15)',
    border: 'rgba(202, 138, 4, 0.5)',
    text: '#fde047',
  },
  green: {
    bg: 'rgba(127, 190, 72, 0.15)',
    border: 'rgba(127, 190, 72, 0.5)',
    text: '#86efac',
  },
}

function Badge({ label, variant }) {
  const s = badgeStyles[variant]
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-[6px] text-[12px] font-medium leading-4 tracking-[-0.09px] whitespace-nowrap border"
      style={{ background: s.bg, borderColor: s.border, color: s.text }}
    >
      {label}
    </span>
  )
}

// Custom tooltip for trend chart
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null
  
  const data = payload[0].payload
  
  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-xl"
      style={{
        background: 'rgba(23, 23, 23, 0.95)',
        backdropFilter: 'blur(12px)',
        borderColor: 'rgba(255, 255, 255, 0.1)'
      }}
    >
      <div className="text-[11px] font-medium text-white/50 mb-1">{data.fullDate}</div>
      <div className="text-[13px] font-semibold text-white">
        ~{data.value >= 1000 ? `${(data.value / 1000).toFixed(1)}k` : data.value} residents
      </div>
      <div className="text-[11px] text-white/40 mt-0.5">{data.rawCount} open requests</div>
    </div>
  )
}

export default function CityKPICards() {
  const [activeCard, setActiveCard] = useState(null)
  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false)
  const [trend14DayData, setTrend14DayData] = useState([])
  const { 
    selectedCity, 
    baltimore311Data, 
    selectedDate, 
    selectedYear, 
    healthOverdoseData,
  } = usePanelContext()
  const cards = cityKPIData[selectedCity] ?? cityKPIData.stl
  const trendCacheRef = useRef({})

  useEffect(() => {
    setActiveCard(null)
  }, [selectedCity])

  // Fetch 14-day trend data for Baltimore (separate from main map data)
  useEffect(() => {
    if (selectedCity !== 'baltimore' || !selectedDate) {
      setTrend14DayData([])
      return
    }

    const asOfDate = new Date(selectedDate)
    asOfDate.setHours(23, 59, 59, 999)
    
    // Calculate 14-day window
    const startDate = new Date(asOfDate)
    startDate.setDate(startDate.getDate() - 13)
    startDate.setHours(0, 0, 0, 0)
    
    const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')} 00:00:00`
    const endDateStr = `${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, '0')}-${String(asOfDate.getDate()).padStart(2, '0')} 23:59:59`
    
    // Check cache first
    const cacheKey = `trend-${startDateStr}-${endDateStr}`
    if (trendCacheRef.current[cacheKey]) {
      processTrendData(trendCacheRef.current[cacheKey], asOfDate)
      return
    }

    // Fetch data for 14-day window
    const url = `https://services1.arcgis.com/UWYHeuuJISiGmgXx/arcgis/rest/services/311_Customer_Service_Requests_${selectedYear}/FeatureServer/0/query` +
      `?where=CreatedDate+%3E%3D+DATE+'${startDateStr}'+AND+CreatedDate+%3C%3D+DATE+'${endDateStr}'` +
      `&outFields=CreatedDate,CloseDate` +
      `&f=geojson&resultRecordCount=5000`

    fetch(url)
      .then((r) => r.json())
      .then((geojson) => {
        trendCacheRef.current[cacheKey] = geojson
        processTrendData(geojson, asOfDate)
      })
      .catch((err) => {
        console.warn('Trend data fetch failed:', err)
        setTrend14DayData([])
      })
  }, [selectedCity, selectedDate, selectedYear])

  // Process fetched trend data into daily counts
  const processTrendData = (geojson, asOfDate) => {
    if (!geojson?.features) {
      setTrend14DayData([])
      return
    }

    const trendData = []
    
    // Generate data for each of the past 14 days
    for (let i = 13; i >= 0; i--) {
      const dayDate = new Date(asOfDate)
      dayDate.setDate(dayDate.getDate() - i)
      const dayTime = dayDate.getTime()
      
      // Count open requests on this specific day
      const openCount = geojson.features.filter(f => {
        const createdTime = f.properties?.CreatedDate
        const closeTime = f.properties?.CloseDate
        
        // Must be created by this day
        if (!createdTime || createdTime > dayTime) return false
        
        // Must be open on this day (no close date OR closed after this day)
        return !closeTime || closeTime > dayTime
      }).length
      
      trendData.push({
        date: dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        value: openCount * 10, // Convert to residents impacted
        rawCount: openCount
      })
    }
    
    setTrend14DayData(trendData)
  }

  // Calculate residents impacted from 311 data (on the selected date)
  const calculateResidentsImpacted = () => {
    if (selectedCity !== 'baltimore' || !baltimore311Data) return '~0'
    
    const asOfDate = new Date(selectedDate)
    // Set to end of day to include all requests from that day
    asOfDate.setHours(23, 59, 59, 999)
    const asOfTime = asOfDate.getTime()
    
    // Count requests open specifically ON the selected date
    const openOnSelectedDate = baltimore311Data.features.filter(f => {
      const createdTime = f.properties?.CreatedDate
      const closeTime = f.properties?.CloseDate
      
      // Must be created by this day
      if (!createdTime || createdTime > asOfTime) return false
      
      // Must be open on this day (no close date OR closed after this day)
      return !closeTime || closeTime > asOfTime
    })
    
    // Estimate: ~10 residents impacted per 311 request (rough approximation)
    const estimatedImpact = openOnSelectedDate.length * 10
    
    if (estimatedImpact >= 1000) {
      return `~${Math.round(estimatedImpact / 1000)}k`
    }
    return `~${estimatedImpact}`
  }

  // Calculate trend direction (comparing last value vs. first value in 14-day window)
  const getTrendIndicator = () => {
    if (trend14DayData.length < 2) return null
    
    const firstValue = trend14DayData[0].value
    const lastValue = trend14DayData[trend14DayData.length - 1].value
    
    if (lastValue === firstValue) return null
    
    // Handle edge case where firstValue is 0
    if (firstValue === 0) {
      return {
        isIncreasing: lastValue > 0,
        percentChange: '100+',
        icon: lastValue > 0 ? TrendingUp : TrendingDown,
        color: lastValue > 0 ? '#fca5a5' : '#86efac'
      }
    }
    
    const percentChange = ((lastValue - firstValue) / firstValue * 100).toFixed(0)
    const isIncreasing = lastValue > firstValue
    
    return {
      isIncreasing,
      percentChange: Math.abs(percentChange),
      icon: isIncreasing ? TrendingUp : TrendingDown,
      color: isIncreasing ? '#fca5a5' : '#86efac' // Red if increasing (bad), green if decreasing (good)
    }
  }

  // Process cards and inject dynamic data
  const processedCards = cards.map(card => {
    if (selectedCity === 'phoenix' && card.placeholderTrendPercent != null) {
      const up = card.placeholderTrendUp !== false
      return {
        ...card,
        trendIndicator: {
          isIncreasing: up,
          percentChange: card.placeholderTrendPercent,
          icon: up ? TrendingUp : TrendingDown,
          color: up ? '#fca5a5' : '#86efac',
        },
      }
    }
    if (card.id === 'performance' && card.metric === 'dynamic') {
      const trendIndicator = getTrendIndicator()
      return {
        ...card,
        metric: calculateResidentsImpacted(),
        trendData: trend14DayData,
        trendIndicator
      }
    }
    return card
  })

  const performanceModalData = useMemo(() => {
    if (selectedCity !== 'baltimore' || !baltimore311Data) return null
    return generatePerformanceModalData(selectedDate, baltimore311Data, healthOverdoseData)
  }, [selectedCity, selectedDate, baltimore311Data, healthOverdoseData])

  // Handle card click - only performance card is clickable for Baltimore
  const handleCardClick = (card) => {
    if (card.id === 'performance' && selectedCity === 'baltimore' && baltimore311Data) {
      setIsPerformanceModalOpen(true)
    }
  }

  // Check if card is clickable
  const isClickable = (card) => {
    return card.id === 'performance' && selectedCity === 'baltimore'
  }

  return (
    <>
      <div
        className="z-50 flex flex-col gap-3 overflow-hidden"
        style={{ width: '300px', maxHeight: '100%' }}
      >
        {processedCards.map((card) => {
          const isActive = activeCard === card.id
          const clickable = isClickable(card)
          return (
            <button
              key={card.id}
              className={cn(
                "text-left w-full flex-1 min-h-0 flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-[10px]",
                clickable ? "cursor-pointer" : "cursor-not-allowed"
              )}
              onClick={() => {
                if (!clickable) return
                handleCardClick(card)
              }}
              aria-disabled={!clickable}
            >
            <Card
              className={cn(
                'w-full flex-1 flex flex-col transition-all duration-200 border weather-overlay-surface weather-overlay-soft-card',
                isActive ? 'border-white/20' : 'border-white/10',
              )}
              style={{
                borderColor: 'var(--color-gray-700)',
                borderRadius: 10,
              }}
            >
              <CardHeader className="flex-1 min-h-0 py-4 justify-between">
                {/* Title */}
                <CardTitle className="text-[11px] font-semibold leading-tight uppercase tracking-wide" style={{ color: 'var(--color-gray-400)' }}>
                  {card.title}
                </CardTitle>

                {/* Metric row with trend indicator */}
                <div className="flex items-baseline gap-2">
                  <span className="text-[28px] font-semibold leading-none" style={{ color: 'var(--color-gray-100)' }}>
                    {card.metric}
                  </span>
                  <span className="text-[13px] font-medium leading-tight" style={{ color: 'var(--color-gray-300)' }}>
                    {card.metricSuffix}
                  </span>
                  {card.trendIndicator && (
                    <div 
                      className="flex items-center gap-1 ml-auto"
                      style={{ color: card.trendIndicator.color }}
                      title={`${card.trendIndicator.isIncreasing ? 'Increased' : 'Decreased'} by ${card.trendIndicator.percentChange}% over the last 14 days`}
                    >
                      <card.trendIndicator.icon className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-semibold">
                        {card.trendIndicator.percentChange}%
                      </span>
                    </div>
                  )}
                </div>

                {/* 14-day trend sparkline */}
                {card.trendData && card.trendData.length > 0 && (
                  <div style={{ width: '248px', height: '52px', marginTop: '10px', marginBottom: '6px' }}>
                    <ResponsiveContainer>
                      <LineChart data={card.trendData} margin={{ top: 5, right: 0, bottom: 5, left: 0 }}>
                        <defs>
                          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fb923c" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#fb923c" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Tooltip 
                          content={<CustomTooltip />}
                          cursor={{ stroke: 'rgba(251, 146, 60, 0.3)', strokeWidth: 1 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#fb923c"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: '#fb923c', strokeWidth: 2, stroke: '#fff' }}
                          fill="url(#trendGradient)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Description */}
                <p className="text-[12px] font-normal leading-snug text-white/40">
                  {card.description}
                </p>

                {/* Badge */}
                <div>
                  <Badge label={card.badge.label} variant={card.badge.variant} />
                </div>
              </CardHeader>
            </Card>
          </button>
        )
      })}
    </div>
    <PerformanceDetailModal
      isOpen={isPerformanceModalOpen}
      onClose={() => setIsPerformanceModalOpen(false)}
      data={performanceModalData}
    />
  </>
  )
}

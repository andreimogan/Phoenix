import { useState, useEffect, useMemo, useRef } from 'react'
import {
  GripVertical,
  RefreshCw,
  Settings,
  X,
  Search,
  ChevronRight,
  ChevronDown,
  Minus,
} from 'lucide-react'
import { usePanelContext } from '../../contexts/PanelContext'
import { useDraggable } from '../../hooks/useDraggable'
import { BUCKET_DEFINITIONS, groupTypesByBucket } from '../../utils/311TypeBuckets'
import { CALLS_BUCKET_DEFS } from '../../utils/callsForService'
import { 
  OVERDOSE_FILTER_CATEGORIES, 
  NALOXONE_FILTER_CATEGORIES,
  initializeOverdoseFilters,
  initializeNaloxoneFilters,
  parseFilterKey,
  getFiltersByCategory,
} from '../../utils/healthDataCategories'
import phoenixHeatIllnessesSyntheticDemo from '../../data/phoenixHeatIllnessesSyntheticDemo.json'
import { getPhoenixCoolingCentersContext } from '../../utils/phoenixCoolingCentersGeojson'

const stlCategories = [
  {
    id: 'boundaries',
    name: 'Boundaries & Risk',
    layers: [
      { id: 'neighborhoods-risk', name: 'Neighborhoods | Risk' },
      { id: 'city-blocks-risk', name: 'City Blocks | Risk' },
      { id: 'city-blocks-complaints', name: 'City Blocks | Complaint Counts' },
      { id: 'city-blocks-top', name: 'City Blocks | Top Complaints' },
    ],
  },
  { id: 'risk', name: 'Risk / Health', layers: [] },
]

const baltimoreCategories = [
  {
    id: 'requests',
    name: '311 Service Requests',
    layers: 'dynamic', // Will be populated from fetched data
  },
  {
    id: 'health',
    name: 'City Health',
    layers: 'health-dynamic', // Will be populated from health data
  },
]

/** Phoenix: same panel structure as Baltimore, but no live data or map wiring yet */
const phoenixCategories = [
  {
    id: 'phoenix-situational-awareness',
    name: 'Situational Awareness View',
    isPhoenixSituationalAwareness: true,
    layers: [],
  },
  {
    id: 'calls',
    name: 'Calls for Service',
    layers: [],
  },
  {
    id: 'phoenix-neighborhood-boundaries',
    name: 'Neighborhood boundaries',
    layers: [],
  },
  {
    id: 'phoenix-council-district-boundaries',
    name: 'Council district boundaries',
    layers: [],
  },
  {
    id: 'heat-homelessness',
    name: 'Heat & Homelessness',
    layers: [
      { id: 'phoenix-heat-stub', isPhoenixHeatStub: true, name: 'Heat (Phoenix — not connected)' },
      { id: 'phoenix-homelessness-services', isPhoenixHomelessnessLayer: true, name: 'Homelessness Services' },
    ],
  },
  {
    id: 'requests',
    name: '311 Service Requests',
    layers: [
      {
        id: 'phoenix-311-stub',
        isPhoenix311Stub: true,
        name: '311 requests (Phoenix — not connected)',
      },
    ],
  },
  {
    id: 'health',
    name: 'City Health',
    layers: [],
  },
]

export default function ManageMapLayersPanel() {
  const [cfsGeocodePromptDismissed, setCfsGeocodePromptDismissed] = useState(false)
  const [phoenixCoolingWeekSummary, setPhoenixCoolingWeekSummary] = useState(null)
  const {
    layersVisible,
    toggleLayers,
    neighborhoodsRiskVisible,
    setNeighborhoodsRiskVisible,
    baltimoreNeighborhoodsData,
    setBaltimoreNeighborhoodsData,
    baltimoreNeighborhoodsAffected,
    setBaltimoreNeighborhoodsAffected,
    baltimoreNeighborhoodsAll,
    setBaltimoreNeighborhoodsAll,
    phoenixNeighborhoodBoundariesVisible,
    setPhoenixNeighborhoodBoundariesVisible,
    phoenixVillagesEnabled,
    setPhoenixVillagesEnabled,
    phoenixVillagesCfsRagVisible,
    setPhoenixVillagesCfsRagVisible,
    phoenixCouncilDistrictsCfsRagVisible,
    setPhoenixCouncilDistrictsCfsRagVisible,
    phoenixCouncilDistrictBoundariesVisible,
    setPhoenixCouncilDistrictBoundariesVisible,
    phoenixCouncilDistrictsEnabled,
    setPhoenixCouncilDistrictsEnabled,
    callsForServiceVisible,
    setCallsForServiceVisible,
    callsForServiceStyle,
    setCallsForServiceStyle,
    callsForServiceTypes,
    setCallsForServiceTypes,
    callsForServiceBuckets,
    callsForServiceNeedsGeocode,
    callsForServiceMissingGeocodeCount,
    callsForServiceMeta,
    startCallsForServiceGeocoding,
    phoenixActiveMasterLayer,
    setPhoenixActiveMasterLayer,
    phoenixSituationalAwareness,
    setPhoenixSituationalHeat,
    setPhoenixSituational311,
    setPhoenixSituationalHousing,
    setPhoenixSituationalEcon,
    togglePhoenixSituationalMaster,
    selectedCity,
    selectedYear,
    selectedDate,
    mapLibreColors,
    setMapLibreColors,
    baltimore311Visible,
    setBaltimore311Visible,
    baltimore311Style,
    setBaltimore311Style,
    baltimore311Clustered,
    setBaltimore311Clustered,
    baltimore311HideClosed,
    setBaltimore311HideClosed,
    baltimore311Types,
    setBaltimore311Types,
    baltimore311Data,
    baltimore311DataYear,
    healthOverdoseVisible,
    setHealthOverdoseVisible,
    healthNaloxoneVisible,
    setHealthNaloxoneVisible,
    healthOverdoseData,
    healthNaloxoneData,
    healthOverdoseFilters,
    setHealthOverdoseFilters,
    healthNaloxoneFilters,
    setHealthNaloxoneFilters,
    healthDataYear,

    phoenixHomelessnessVisible,
    setPhoenixHomelessnessVisible,
    phoenixHomelessnessSnapshot,
    phoenixHomelessnessMeta,
    phoenixHomelessnessCategoryEnabled,
    setPhoenixHomelessnessCategoryEnabled,
    phoenixHomelessnessTimeMode,
    setPhoenixHomelessnessTimeMode,
    phoenixHomelessnessAffectedNeighborhoodsVisible,
    setPhoenixHomelessnessAffectedNeighborhoodsVisible,
    phoenixTemperatureNeighborhoodsVisible,
    setPhoenixTemperatureNeighborhoodsVisible,
    phoenixTemperatureNeighborhoodsLabelsVisible,
    setPhoenixTemperatureNeighborhoodsLabelsVisible,
    phoenixHeatDeathsVisible,
    setPhoenixHeatDeathsVisible,
    phoenixHeatDeathsLabelsVisible,
    setPhoenixHeatDeathsLabelsVisible,

    phoenixHeatIllnessesVisible,
    setPhoenixHeatIllnessesVisible,
    phoenixCoolingCentersVisible,
    setPhoenixCoolingCentersVisible,
    phoenixHeatIllnessesEnabled,
    setPhoenixHeatIllnessesEnabled,
    phoenixHeatIllnessesTimeMode,
    setPhoenixHeatIllnessesTimeMode,
    phoenixHeatIllnessesGranularity,
    setPhoenixHeatIllnessesGranularity,
    phoenixHeatIllnessesGeoView,
    setPhoenixHeatIllnessesGeoView,
    phoenixCoolingCentersGeoView,
    setPhoenixCoolingCentersGeoView,
    phoenixCoolingCentersTimeMode,
    setPhoenixCoolingCentersTimeMode,
    phoenixCityServicesOverlayMode,
    setPhoenixCityServicesOverlayMode,
    phoenixHeatIllnessGeoLabelsVisible,
    setPhoenixHeatIllnessGeoLabelsVisible,
  } = usePanelContext()

  useEffect(() => {
    if (selectedCity !== 'phoenix') {
      setPhoenixCoolingWeekSummary(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const asOf = selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime())
          ? selectedDate
          : new Date()
        const ccMode = String(phoenixCoolingCentersTimeMode || 'current') === 'all_historical'
          ? 'all_historical'
          : 'current'
        const ctx = await getPhoenixCoolingCentersContext(asOf, ccMode)
        if (!cancelled) setPhoenixCoolingWeekSummary(ctx)
      } catch {
        if (!cancelled) setPhoenixCoolingWeekSummary({ ok: false, label: 'Could not load cooling week' })
      }
    })()
    return () => { cancelled = true }
  }, [selectedCity, selectedDate, phoenixCoolingCentersTimeMode])

  const phoenixHeatIllnessCounts = useMemo(() => {
    const mode = String(phoenixHeatIllnessesTimeMode || 'current')
    const gran = String(phoenixHeatIllnessesGranularity || 'week')
    const rows = phoenixHeatIllnessesSyntheticDemo?.rows || []
    const out = new Map()

    const msDay = 24 * 60 * 60 * 1000
    const toUtcDayMs = (d) => {
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) return NaN
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return Date.parse(`${y}-${m}-${dd}T00:00:00Z`)
    }
    const selectedDayMs = toUtcDayMs(selectedDate)
    const selectedYearLocal = selectedDate instanceof Date ? selectedDate.getFullYear() : null
    const selectedMonthLocal = selectedDate instanceof Date ? selectedDate.getMonth() + 1 : null

    const inSelectedWeek = (weekStartIso) => {
      const start = Date.parse(String(weekStartIso || '') + 'T00:00:00Z')
      if (!Number.isFinite(start) || !Number.isFinite(selectedDayMs)) return false
      return selectedDayMs >= start && selectedDayMs <= start + 6 * msDay
    }
    const inSelectedMonth = (weekStartIso) => {
      if (!selectedYearLocal || !selectedMonthLocal) return false
      const m = String(weekStartIso || '').match(/^(\d{4})-(\d{2})-\d{2}$/)
      if (!m) return false
      return Number(m[1]) === selectedYearLocal && Number(m[2]) === selectedMonthLocal
    }

    const filtered = rows.filter((r) => {
      const dt = String(r?.Data_Type || '').trim()
      if (mode === 'all_historical' && dt !== 'HISTORICAL') return false
      if (mode === 'current') {
        if (gran === 'month') return inSelectedMonth(r?.Week_Start)
        return inSelectedWeek(r?.Week_Start)
      }
      return true
    })

    let allTotal = 0
    for (const r of filtered) {
      const illness = String(r?.Heat_Illness || '').trim()
      const c = Number(r?.Count || 0)
      if (!illness || !Number.isFinite(c)) continue
      out.set(illness, (out.get(illness) || 0) + c)
      allTotal += c
    }
    out.set('__ALL__', allTotal)
    return out
  }, [selectedDate, phoenixHeatIllnessesTimeMode, phoenixHeatIllnessesGranularity])

  const PANEL_WIDTH = 320
  const RIGHT_MARGIN = 24
  const TOP_OFFSET = 80

  const getRightAlignedPosition = () => ({
    x: typeof window !== 'undefined' ? window.innerWidth - PANEL_WIDTH - RIGHT_MARGIN : 0,
    y: TOP_OFFSET,
  })

  const { position, setPosition, isDragging, dragRef, handleMouseDown } = useDraggable(getRightAlignedPosition())

  useEffect(() => {
    if (layersVisible) {
      setPosition({ x: window.innerWidth - PANEL_WIDTH - RIGHT_MARGIN, y: TOP_OFFSET })
    }
  }, [layersVisible, setPosition])

  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState({ boundaries: true, requests: true, health: true })
  const [expandedBuckets, setExpandedBuckets] = useState({}) // Track which 311 buckets are expanded
  const [expandedCfsBuckets, setExpandedCfsBuckets] = useState({})
  const [expandedCfsServiceTypes, setExpandedCfsServiceTypes] = useState(true)
  const [expandedHealthCategories, setExpandedHealthCategories] = useState({}) // Track which health filter categories are expanded
  const [expandedPhoenixHomelessness, setExpandedPhoenixHomelessness] = useState(true)
  const [expandedPhoenixHeat, setExpandedPhoenixHeat] = useState(true)
  const [expandedPhoenixHeatIllnesses, setExpandedPhoenixHeatIllnesses] = useState(true)
  const [expandedPhoenixCoolingCenters, setExpandedPhoenixCoolingCenters] = useState(false)
  /** City Services = Cooling Centers + Homelessness (nested under Heat & Homelessness) */
  const [expandedPhoenixCityServices, setExpandedPhoenixCityServices] = useState(true)
  const cityServicesSnapshotRef = useRef({
    cooling: true,
    homeless: true,
    affected: false,
  })

  /** Last Heat + City Services visibilities before turning the category master off — restored when master is toggled back on. */
  const heatHomelessnessBundleSnapshotRef = useRef({
    heatIllnesses: true,
    heatDeaths: false,
    temperature: false,
    cooling: true,
    homeless: true,
    affected: false,
  })

  const [expandedPhoenixHeatDeaths, setExpandedPhoenixHeatDeaths] = useState(false)
  const [expandedPhoenixTemperature, setExpandedPhoenixTemperature] = useState(false)
  const [basemapStyleOpen, setBasemapStyleOpen] = useState(false)
  const [layerStates, setLayerStates] = useState({
    'neighborhoods-risk': neighborhoodsRiskVisible,
    'city-blocks-risk': false,
    'city-blocks-complaints': false,
    'city-blocks-top': false,
    'baltimore-311-cluster': baltimore311Clustered,
  })

  // Extract unique 311 types from fetched data and initialize their states
  useEffect(() => {
    if (!baltimore311Data || selectedCity !== 'baltimore') return
    // Data is already filtered by date from the API, no need to re-filter
    const uniqueTypes = [...new Set(
      baltimore311Data.features
        .filter((f) => {
          const srType = f?.properties?.SRType
          const hasValidPoint =
            f?.geometry?.type === 'Point' &&
            Array.isArray(f?.geometry?.coordinates) &&
            f.geometry.coordinates.length >= 2
          
          return srType && hasValidPoint
        })
        .map(f => f.properties.SRType)
    )].sort()
    
    // Initialize all types to true (all enabled by default)
    const typesObj = {}
    uniqueTypes.forEach(t => { typesObj[t] = true })
    setBaltimore311Types(typesObj)

    // Auto-expand first bucket
    const grouped = groupTypesByBucket(uniqueTypes)
    const firstBucket = Object.keys(grouped)[0]
    if (firstBucket) setExpandedBuckets({ [firstBucket]: true })
  }, [baltimore311Data, selectedCity, selectedDate, setBaltimore311Types])

  // Initialize health data filters when health data loads
  useEffect(() => {
    if (selectedCity !== 'baltimore' || !healthOverdoseData) return
    
    // Initialize overdose filters if empty
    if (Object.keys(healthOverdoseFilters).length === 0) {
      setHealthOverdoseFilters(initializeOverdoseFilters())
    }
  }, [healthOverdoseData, selectedCity, healthOverdoseFilters, setHealthOverdoseFilters])

  useEffect(() => {
    if (selectedCity !== 'baltimore' || !healthNaloxoneData) return
    
    // Initialize naloxone filters if empty
    if (Object.keys(healthNaloxoneFilters).length === 0) {
      setHealthNaloxoneFilters(initializeNaloxoneFilters())
    }
  }, [healthNaloxoneData, selectedCity, healthNaloxoneFilters, setHealthNaloxoneFilters])

  if (!layersVisible) return null

  const toggleCategory = (id) => {
    setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleBucket = (bucketId) => {
    setExpandedBuckets(prev => ({ ...prev, [bucketId]: !prev[bucketId] }))
  }

  const toggleCfsBucket = (bucketId) => {
    setExpandedCfsBuckets(prev => ({ ...prev, [bucketId]: !prev[bucketId] }))
  }

  const toggleBucketTypes = (bucketId, types) => {
    const allOn = types.every(t => baltimore311Types[t])
    const newState = !allOn // If all on, turn all off; otherwise turn all on
    const updates = {}
    types.forEach(t => { updates[t] = newState })
    setBaltimore311Types(prev => ({ ...prev, ...updates }))
  }

  const toggleAll311Types = () => {
    const allTypes = Object.keys(baltimore311Types)
    const allOn = allTypes.every(t => baltimore311Types[t])
    const newState = !allOn // If all on, turn all off; otherwise turn all on
    const updates = {}
    allTypes.forEach(t => { updates[t] = newState })
    setBaltimore311Types(prev => ({ ...prev, ...updates }))
  }

  const getGlobalToggleState = () => {
    const allTypes = Object.keys(baltimore311Types)
    if (allTypes.length === 0) return 'off'
    const onCount = allTypes.filter(t => baltimore311Types[t]).length
    if (onCount === 0) return 'off'
    if (onCount === allTypes.length) return 'on'
    return 'mixed'
  }

  // Health data helpers
  const toggleHealthFilter = (filterKey) => {
    const { category } = parseFilterKey(filterKey)
    if (category === 'locationType') {
      setHealthNaloxoneFilters(prev => ({ ...prev, [filterKey]: !prev[filterKey] }))
    } else {
      setHealthOverdoseFilters(prev => ({ ...prev, [filterKey]: !prev[filterKey] }))
    }
  }

  const toggleHealthCategory = (categoryId) => {
    setExpandedHealthCategories(prev => ({ ...prev, [categoryId]: !prev[categoryId] }))
  }

  const togglePhoenixHomelessnessCategory = (categoryName) => {
    setPhoenixHomelessnessCategoryEnabled((prev) => ({
      ...(prev || {}),
      [categoryName]: !prev?.[categoryName],
    }))
  }

  const togglePhoenixVillage = (villageName) => {
    setPhoenixVillagesEnabled((prev) => ({
      ...(prev || {}),
      [villageName]: !prev?.[villageName],
    }))
  }

  const togglePhoenixCouncilDistrict = (districtId) => {
    setPhoenixCouncilDistrictsEnabled((prev) => ({
      ...(prev || {}),
      [districtId]: prev?.[districtId] === false ? true : false,
    }))
  }

  const togglePhoenixHeatIllness = (illness) => {
    if (selectedCity === 'phoenix' && phoenixActiveMasterLayer !== 'heat-homelessness') {
      setPhoenixActiveMasterLayer('heat-homelessness')
    }
    if (!phoenixHeatIllnessesVisible) setPhoenixHeatIllnessesVisible(true)
    setPhoenixHeatIllnessesEnabled((prev) => ({
      ...(prev || {}),
      [illness]: prev?.[illness] === false ? true : false,
    }))
  }

  const togglePhoenixHeatIllnessesAll = () => {
    const keys = Object.keys(phoenixHeatIllnessesEnabled || {})
    if (!keys.length) return
    const allOn = keys.every((k) => phoenixHeatIllnessesEnabled?.[k] !== false)
    const nextVal = !allOn
    const next = {}
    keys.forEach((k) => { next[k] = nextVal })
    if (nextVal && selectedCity === 'phoenix' && phoenixActiveMasterLayer !== 'heat-homelessness') {
      setPhoenixActiveMasterLayer('heat-homelessness')
    }
    if (nextVal && !phoenixHeatIllnessesVisible) setPhoenixHeatIllnessesVisible(true)
    setPhoenixHeatIllnessesEnabled(next)
  }

  const activateHeatMasterIfNeeded = () => {
    if (selectedCity === 'phoenix' && phoenixActiveMasterLayer !== 'heat-homelessness') {
      setPhoenixActiveMasterLayer('heat-homelessness')
    }
  }

  const enforcePhoenixHeatSubLayerExclusivity = (keep) => {
    // Only one of: Heat Illnesses | Heat Deaths | Temperature
    if (keep !== 'illnesses') setPhoenixHeatIllnessesVisible(false)
    if (keep !== 'deaths') setPhoenixHeatDeathsVisible(false)
    if (keep !== 'temperature') setPhoenixTemperatureNeighborhoodsVisible(false)
  }

  /** Turn off choropleths/metrics under the Heat accordion (illnesses, deaths, temperature). */
  const disablePhoenixHeatStack = () => {
    setPhoenixHeatIllnessesVisible(false)
    setPhoenixHeatDeathsVisible(false)
    setPhoenixTemperatureNeighborhoodsVisible(false)
  }

  /**
   * Heat stack vs City Services:
   * - Activating Heat turns off BOTH Cooling Centers and Homelessness.
   * - Activating either City Service turns off Heat stack only; Cooling + Homelessness can be on together.
   */
  const enforcePhoenixHeatHomelessnessPrimaryExclusivity = (keep) => {
    if (keep === 'heat') {
      setPhoenixCoolingCentersVisible(false)
      setPhoenixHomelessnessVisible(false)
      setPhoenixHomelessnessAffectedNeighborhoodsVisible(false)
      return
    }
    if (keep === 'cooling' || keep === 'homeless') {
      disablePhoenixHeatStack()
    }
  }

  const getPhoenixCityServicesMasterState = () => {
    const c = !!phoenixCoolingCentersVisible
    const h = !!phoenixHomelessnessVisible
    if (!c && !h) return 'off'
    if (c && h) return 'on'
    return 'mixed'
  }

  const reconcileHeatOnlySubLayerSnapshot = (raw) => {
    let heatIllnesses = !!raw.heatIllnesses
    let heatDeaths = !!raw.heatDeaths
    let temperature = !!raw.temperature
    const activeCount = [heatIllnesses, heatDeaths, temperature].filter(Boolean).length
    if (activeCount <= 1) {
      return { heatIllnesses, heatDeaths, temperature }
    }
    // Sub-layers are mutually exclusive; prefer illnesses, then temperature, then deaths.
    if (heatIllnesses) {
      return { heatIllnesses: true, heatDeaths: false, temperature: false }
    }
    if (temperature) {
      return { heatIllnesses: false, heatDeaths: false, temperature: true }
    }
    return { heatIllnesses: false, heatDeaths: true, temperature: false }
  }

  /** Sticky Heat & Homelessness category header toggle: bundles Heat stack + City Services on/off together. */
  const togglePhoenixHeatHomelessnessCategoryMaster = () => {
    if (selectedCity !== 'phoenix') return
    if (phoenixActiveMasterLayer === 'heat-homelessness') {
      heatHomelessnessBundleSnapshotRef.current = {
        heatIllnesses: !!phoenixHeatIllnessesVisible,
        heatDeaths: !!phoenixHeatDeathsVisible,
        temperature: !!phoenixTemperatureNeighborhoodsVisible,
        cooling: !!phoenixCoolingCentersVisible,
        homeless: !!phoenixHomelessnessVisible,
        affected: !!phoenixHomelessnessAffectedNeighborhoodsVisible,
      }
      setPhoenixActiveMasterLayer(null)
      return
    }
    setPhoenixActiveMasterLayer('heat-homelessness')
    const snap = heatHomelessnessBundleSnapshotRef.current
    const heat = reconcileHeatOnlySubLayerSnapshot(snap)
    let cooling = !!snap.cooling
    let homeless = !!snap.homeless
    if (!cooling && !homeless) {
      cooling = true
      homeless = true
    }
    const affected = !!(homeless && snap.affected)
    if (!heat.heatIllnesses && !heat.heatDeaths && !heat.temperature) {
      heat.heatIllnesses = true
      heat.heatDeaths = false
      heat.temperature = false
    }
    setPhoenixHeatIllnessesVisible(heat.heatIllnesses)
    setPhoenixHeatDeathsVisible(heat.heatDeaths)
    setPhoenixTemperatureNeighborhoodsVisible(heat.temperature)
    setPhoenixCoolingCentersVisible(cooling)
    setPhoenixHomelessnessVisible(homeless)
    setPhoenixHomelessnessAffectedNeighborhoodsVisible(affected)
  }

  const togglePhoenixCityServicesMaster = () => {
    const state = getPhoenixCityServicesMasterState()
    if (state === 'off') {
      const s = cityServicesSnapshotRef.current
      setPhoenixCoolingCentersVisible(!!s.cooling)
      setPhoenixHomelessnessVisible(!!s.homeless)
      setPhoenixHomelessnessAffectedNeighborhoodsVisible(!!s.homeless && !!s.affected)
      disablePhoenixHeatStack()
      activateHeatMasterIfNeeded()
      return
    }
    cityServicesSnapshotRef.current = {
      cooling: !!phoenixCoolingCentersVisible,
      homeless: !!phoenixHomelessnessVisible,
      affected: !!phoenixHomelessnessAffectedNeighborhoodsVisible,
    }
    setPhoenixCoolingCentersVisible(false)
    setPhoenixHomelessnessVisible(false)
    setPhoenixHomelessnessAffectedNeighborhoodsVisible(false)
  }

  const togglePhoenixHeatIllnessesLayer = () => {
    setPhoenixHeatIllnessesVisible((prev) => {
      const next = !prev
      if (next) {
        enforcePhoenixHeatHomelessnessPrimaryExclusivity('heat')
        enforcePhoenixHeatSubLayerExclusivity('illnesses')
        activateHeatMasterIfNeeded()
      }
      return next
    })
  }

  const togglePhoenixHeatDeathsLayer = () => {
    // Disabled (out of scope for now)
    return;
    setPhoenixHeatDeathsVisible((prev) => {
      const next = !prev
      if (next) {
        enforcePhoenixHeatSubLayerExclusivity('deaths')
        activateHeatMasterIfNeeded()
      }
      return next
    })
  }

  const togglePhoenixCoolingCentersLayer = () => {
    setPhoenixCoolingCentersVisible((prev) => {
      const next = !prev
      if (next) {
        activateHeatMasterIfNeeded()
        enforcePhoenixHeatHomelessnessPrimaryExclusivity('cooling')
      }
      return next
    })
  }

  const togglePhoenixTemperatureLayer = () => {
    setPhoenixTemperatureNeighborhoodsVisible((prev) => {
      const next = !prev
      if (next) {
        enforcePhoenixHeatHomelessnessPrimaryExclusivity('heat')
        enforcePhoenixHeatSubLayerExclusivity('temperature')
        activateHeatMasterIfNeeded()
      }
      return next
    })
  }

  const getPhoenixHeatMasterState = () => {
    const flags = [
      !!phoenixHeatIllnessesVisible,
      !!phoenixHeatDeathsVisible,
      !!phoenixTemperatureNeighborhoodsVisible,
    ]
    const onCount = flags.filter(Boolean).length
    if (onCount === 0) return 'off'
    if (onCount === flags.length) return 'on'
    return 'mixed'
  }

  /**
   * Sticky "Heat & Homelessness" header switch — same visual pattern as the inner Heat toggle:
   * fully on (thumb right) only when both top inner accordions are active (any Heat sub-layer on, any City Services layer on);
   * mixed (−) when the category is selected but one of those accordions is fully off.
   */
  const getPhoenixHeatHomelessnessCategorySwitchVisualState = () => {
    if (phoenixActiveMasterLayer !== 'heat-homelessness') return 'off'
    const heatAccordionOn = getPhoenixHeatMasterState() !== 'off'
    const cityServicesAccordionOn = getPhoenixCityServicesMasterState() !== 'off'
    if (heatAccordionOn && cityServicesAccordionOn) return 'on'
    return 'mixed'
  }

  const togglePhoenixHeatMaster = () => {
    const state = getPhoenixHeatMasterState()
    if (state === 'off') {
      enforcePhoenixHeatHomelessnessPrimaryExclusivity('heat')
      setPhoenixHeatIllnessesVisible(true)
      activateHeatMasterIfNeeded()
      return
    }
    setPhoenixHeatIllnessesVisible(false)
    setPhoenixHeatDeathsVisible(false)
    setPhoenixTemperatureNeighborhoodsVisible(false)
  }

  const getPhoenixCouncilDistrictsMasterState = () => {
    const keys = Object.keys(phoenixCouncilDistrictsEnabled || {})
    if (!phoenixCouncilDistrictBoundariesVisible) return 'off'
    if (!keys.length) return 'off'
    const onCount = keys.filter((k) => phoenixCouncilDistrictsEnabled?.[k] !== false).length
    if (onCount === 0) return 'off'
    if (onCount === keys.length) return 'on'
    return 'mixed'
  }

  const toggleAllPhoenixCouncilDistricts = () => {
    const keys = Object.keys(phoenixCouncilDistrictsEnabled || {})
    if (!keys.length) {
      setPhoenixCouncilDistrictBoundariesVisible((v) => {
        const next = !v
        if (next) {
          setPhoenixNeighborhoodBoundariesVisible(false)
          setPhoenixHomelessnessAffectedNeighborhoodsVisible(false)
          setPhoenixVillagesCfsRagVisible(false)
          setPhoenixCouncilDistrictsCfsRagVisible(false)
        }
        return next
      })
      return
    }
    const state = getPhoenixCouncilDistrictsMasterState()
    const nextOn = state === 'off'
    const nextEnabled = {}
    keys.forEach((k) => { nextEnabled[k] = nextOn })
    setPhoenixCouncilDistrictsEnabled(nextEnabled)
    setPhoenixCouncilDistrictBoundariesVisible(nextOn)
    if (nextOn) {
      setPhoenixNeighborhoodBoundariesVisible(false)
      setPhoenixHomelessnessAffectedNeighborhoodsVisible(false)
      setPhoenixVillagesCfsRagVisible(false)
      setPhoenixCouncilDistrictsCfsRagVisible(false)
    }
  }

  const getPhoenixVillagesMasterState = () => {
    const names = Object.keys(phoenixVillagesEnabled || {})
    if (!phoenixNeighborhoodBoundariesVisible) return 'off'
    if (!names.length) return 'off'
    const onCount = names.filter((n) => phoenixVillagesEnabled?.[n] !== false).length
    if (onCount === 0) return 'off'
    if (onCount === names.length) return 'on'
    return 'mixed'
  }

  const toggleAllPhoenixVillages = () => {
    const names = Object.keys(phoenixVillagesEnabled || {})
    if (!names.length) {
      setPhoenixNeighborhoodBoundariesVisible((v) => {
        const next = !v
        if (next) {
          setPhoenixCouncilDistrictBoundariesVisible(false)
          setPhoenixHomelessnessAffectedNeighborhoodsVisible(false)
          setPhoenixVillagesCfsRagVisible(false)
          setPhoenixCouncilDistrictsCfsRagVisible(false)
        }
        return next
      })
      return
    }

    const state = getPhoenixVillagesMasterState()
    const nextOn = state === 'off' // off->on, mixed/on->off

    const nextEnabled = {}
    names.forEach((n) => { nextEnabled[n] = nextOn })
    setPhoenixVillagesEnabled(nextEnabled)
    setPhoenixNeighborhoodBoundariesVisible(nextOn)
    if (nextOn) {
      setPhoenixCouncilDistrictBoundariesVisible(false)
      setPhoenixHomelessnessAffectedNeighborhoodsVisible(false)
      setPhoenixVillagesCfsRagVisible(false)
      setPhoenixCouncilDistrictsCfsRagVisible(false)
    }
  }

  const togglePhoenixVillagesCfsRag = () => {
    setPhoenixVillagesCfsRagVisible((prev) => {
      const next = !prev
      if (!next) return false

      if (selectedCity === 'phoenix' && phoenixActiveMasterLayer !== 'calls') {
        setPhoenixActiveMasterLayer('calls')
      }
      setCallsForServiceVisible(true)
      setPhoenixCouncilDistrictsCfsRagVisible(false)
      setPhoenixNeighborhoodBoundariesVisible(false)
      setPhoenixCouncilDistrictBoundariesVisible(false)
      setPhoenixHomelessnessAffectedNeighborhoodsVisible(false)
      return true
    })
  }

  const togglePhoenixCouncilDistrictsCfsRag = () => {
    setPhoenixCouncilDistrictsCfsRagVisible((prev) => {
      const next = !prev
      if (!next) return false

      if (selectedCity === 'phoenix' && phoenixActiveMasterLayer !== 'calls') {
        setPhoenixActiveMasterLayer('calls')
      }
      setCallsForServiceVisible(true)
      setPhoenixVillagesCfsRagVisible(false)
      setPhoenixNeighborhoodBoundariesVisible(false)
      setPhoenixCouncilDistrictBoundariesVisible(false)
      setPhoenixHomelessnessAffectedNeighborhoodsVisible(false)
      return true
    })
  }

  const getHealthCategoryCount = (categoryId, isOverdose) => {
    const data = isOverdose ? healthOverdoseData : healthNaloxoneData
    if (!data) return 0
    
    const asOfDate = new Date(selectedDate)
    asOfDate.setHours(23, 59, 59, 999)
    const asOfTime = asOfDate.getTime()
    
    const dateField = isOverdose ? 'incidentDate' : 'distributionDate'
    
    return data.features.filter(f => f.properties[dateField] <= asOfTime).length
  }

  const getBucketToggleState = (types) => {
    const onCount = types.filter(t => baltimore311Types[t]).length
    if (onCount === 0) return 'off'
    if (onCount === types.length) return 'on'
    return 'mixed'
  }

  // Check if at least one 311 type is enabled
  const hasAny311TypeEnabled = Object.values(baltimore311Types).some(v => v === true)

  const toggleAllCfsTypes = () => {
    const allTypes = Object.keys(callsForServiceTypes || {})
    if (!allTypes.length) return
    const allOn = allTypes.every(t => callsForServiceTypes[t])
    const next = {}
    allTypes.forEach(t => { next[t] = !allOn })
    setCallsForServiceTypes(prev => ({ ...prev, ...next }))
  }

  const getCfsGlobalToggleState = () => {
    const allTypes = Object.keys(callsForServiceTypes || {})
    if (!allTypes.length) return 'off'
    const onCount = allTypes.filter(t => callsForServiceTypes[t]).length
    if (onCount === 0) return 'off'
    if (onCount === allTypes.length) return 'on'
    return 'mixed'
  }

  const getCfsBucketToggleState = (bucket) => {
    const typeNames = (bucket?.types || []).map((t) => t.typeName)
    if (!typeNames.length) return 'off'
    const onCount = typeNames.filter((n) => callsForServiceTypes?.[n] !== false).length
    if (onCount === 0) return 'off'
    if (onCount === typeNames.length) return 'on'
    return 'mixed'
  }

  const toggleCfsBucketTypes = (bucket) => {
    const typeNames = (bucket?.types || []).map((t) => t.typeName)
    if (!typeNames.length) return
    const allOn = typeNames.every((n) => callsForServiceTypes?.[n] !== false)
    const nextVal = allOn ? false : true
    const updates = {}
    typeNames.forEach((n) => { updates[n] = nextVal })
    if (nextVal === true && !callsForServiceVisible) setCallsForServiceVisible(true)
    if (nextVal === true && selectedCity === 'phoenix' && phoenixActiveMasterLayer !== 'calls') {
      setPhoenixActiveMasterLayer('calls')
    }
    setCallsForServiceTypes((prev) => ({ ...prev, ...updates }))
  }

  const toggleCfsType = (typeName) => {
    setCallsForServiceTypes((prev) => {
      const nextVal = !(prev?.[typeName])
      if (nextVal === true && !callsForServiceVisible) setCallsForServiceVisible(true)
      if (nextVal === true && selectedCity === 'phoenix' && phoenixActiveMasterLayer !== 'calls') {
        setPhoenixActiveMasterLayer('calls')
      }
      return { ...prev, [typeName]: nextVal }
    })
  }

  /** Master switch: map visibility + every call type on (true) or off (false). */
  const toggleCallsForServiceLayer = () => {
    const next = !callsForServiceVisible
    setCallsForServiceVisible(next)
    if (next && selectedCity === 'phoenix' && phoenixActiveMasterLayer !== 'calls') {
      setPhoenixActiveMasterLayer('calls')
    }
    if (!next) {
      if (phoenixVillagesCfsRagVisible) setPhoenixVillagesCfsRagVisible(false)
      if (phoenixCouncilDistrictsCfsRagVisible) setPhoenixCouncilDistrictsCfsRagVisible(false)
    }
    setCallsForServiceTypes((prev) => {
      const keys = Object.keys(prev || {})
      if (!keys.length) return prev || {}
      const out = { ...prev }
      keys.forEach((k) => { out[k] = next })
      return out
    })
  }

  const getBucketRequestCount = (types) => {
    if (!baltimore311Data) return 0
    // Data is already filtered by date from the API, no need to re-filter
    return baltimore311Data.features.filter((f) => {
      const srType = f?.properties?.SRType
      const isEnabledType = types.includes(srType)
      const hasValidPoint =
        f?.geometry?.type === 'Point' &&
        Array.isArray(f?.geometry?.coordinates) &&
        f.geometry.coordinates.length >= 2
      
      return isEnabledType && hasValidPoint
    }).length
  }

  const toggleLayer = (layerId) => {
    const newState = !layerStates[layerId]
    setLayerStates(prev => ({ ...prev, [layerId]: newState }))
    if (layerId === 'neighborhoods-risk') setNeighborhoodsRiskVisible(newState)
  }

  const handleBasemapStyleSelect = (style) => {
    if (selectedCity === 'phoenix') {
      setCallsForServiceStyle(style) // 'default' | 'cluster' | 'heatmap'
      setBasemapStyleOpen(false)
      return
    }

    setBaltimore311Style(style)
    // Update old baltimore311Clustered for backward compatibility
    setBaltimore311Clustered(style === 'cluster')
    setLayerStates(prev => ({ ...prev, 'baltimore-311-cluster': style === 'cluster' }))
    setBasemapStyleOpen(false)
  }

  const toggle311Type = (typeName) => {
    setBaltimore311Types(prev => ({ ...prev, [typeName]: !prev[typeName] }))
  }

  // Build dynamic Baltimore 311 layers from data (grouped by bucket)
  const baltimoreCategoriesWithBuckets = baltimoreCategories.map(cat => {
    if (cat.layers === 'dynamic') {
      const types = Object.keys(baltimore311Types).sort()
      const bucketGroups = groupTypesByBucket(types)
      
      const bucketLayers = Object.entries(bucketGroups).map(([bucketId, bucketTypes]) => {
        const bucketDef = BUCKET_DEFINITIONS[bucketId] || { id: bucketId, name: bucketId === 'other' ? 'Other / Unknown' : bucketId }
        return {
          id: `bucket-${bucketId}`,
          name: bucketDef.name,
          isBucket: true,
          bucketId,
          types: bucketTypes,
        }
      })
      
      return { ...cat, layers: bucketLayers }
    }
    
    if (cat.layers === 'health-dynamic') {
      // Build health data layers
      const healthLayers = [
        {
          id: 'health-overdose',
          name: 'Overdose Incidents',
          isHealthLayer: true,
          healthType: 'overdose',
          filterCategories: OVERDOSE_FILTER_CATEGORIES,
        },
        {
          id: 'health-naloxone',
          name: 'Naloxone Distribution',
          isHealthLayer: true,
          healthType: 'naloxone',
          filterCategories: NALOXONE_FILTER_CATEGORIES,
        },
      ]
      
      return { ...cat, layers: healthLayers }
    }
    
    return cat
  })

  const activeCategories =
    selectedCity === 'baltimore'
      ? baltimoreCategoriesWithBuckets
      : selectedCity === 'phoenix'
        ? phoenixCategories
        : stlCategories

  // Enhanced search: search in bucket names AND individual type names
  const filteredCategories = activeCategories.map(cat => {
    if (!searchQuery) {
      return { ...cat, layers: cat.layers }
    }
    
    const query = searchQuery.toLowerCase()
    
    return {
      ...cat,
      layers: cat.layers
        .map(layer => {
          // For health layers, search in layer name and filter categories
          if (layer.isHealthLayer) {
            const layerNameMatches = layer.name.toLowerCase().includes(query)
            if (layerNameMatches) return layer
            
            // Check if any filter options match
            const hasMatchingFilters = Object.values(layer.filterCategories).some(category =>
              category.options.some(opt => opt.toLowerCase().includes(query))
            )
            if (hasMatchingFilters) return { ...layer, isFiltered: true }
            
            return null
          }
          
          // For buckets, check if bucket name matches OR any of its types match
          if (layer.isBucket) {
            const bucketNameMatches = layer.name.toLowerCase().includes(query)
            const matchingTypes = layer.types.filter(t => t.toLowerCase().includes(query))
            
            // If bucket name matches, include all types
            if (bucketNameMatches) {
              return layer
            }
            
            // If any types match, return bucket with only matching types
            if (matchingTypes.length > 0) {
              return {
                ...layer,
                types: matchingTypes,
                isFiltered: true // Mark as filtered so we can auto-expand it
              }
            }
            
            // No match
            return null
          }
          
          // For regular layers, simple name match
          return layer.name.toLowerCase().includes(query) ? layer : null
        })
        .filter(Boolean) // Remove nulls
    }
  })

  return (
    <div
      className="rounded-xl border fixed shadow-xl overflow-hidden flex flex-col z-[80]"
      role="region"
      aria-label="Map Layers"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
        width: '320px',
        maxHeight: 'calc(100vh - 5rem)',
        backgroundColor: 'var(--sand-surface)',
        borderColor: 'var(--color-gray-700)',
        color: 'var(--color-gray-100)',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div
        ref={dragRef}
        className="p-3 flex items-center justify-between select-none border-b shrink-0"
        style={{
          borderColor: 'var(--color-gray-700)',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="w-4 h-4 shrink-0" style={{ color: 'var(--color-gray-400)' }} aria-hidden="true" />
          <span className="shrink-0">
            <svg className="w-4 h-4" style={{ color: 'var(--color-gray-500)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight truncate" style={{ color: 'var(--color-gray-100)' }}>
              Manage Map Layers
            </h2>
            <p className="text-xs opacity-70" style={{ color: 'var(--color-gray-400)' }}>
              Click categories to expand
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-7 w-7"
            style={{ color: 'var(--color-gray-300)' }}
            title="Reload layer settings"
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-gray-100)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-gray-300)'}
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
          <div className="relative">
            <button
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-7 w-7"
              style={{ color: basemapStyleOpen ? 'var(--color-gray-100)' : 'var(--color-gray-300)' }}
              title="Basemap settings"
              onClick={() => setBasemapStyleOpen(!basemapStyleOpen)}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-gray-100)'}
              onMouseLeave={(e) => !basemapStyleOpen && (e.currentTarget.style.color = 'var(--color-gray-300)')}
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
            </button>
            {basemapStyleOpen && (
              <div
                className="absolute right-0 mt-1 w-48 rounded-[8px] border shadow-lg z-50 overflow-hidden"
                style={{ borderColor: 'var(--color-gray-700)', background: 'var(--sand-surface)' }}
              >
                <div className="p-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide px-2 py-1.5" style={{ color: 'var(--color-gray-400)' }}>
                    {selectedCity === 'phoenix' ? 'Calls for Service View' : 'Basemap Style'}
                  </div>
                  <button
                    className="w-full text-left px-2.5 py-2 text-sm rounded-md flex items-center justify-between transition-colors"
                    style={{
                      color: 'var(--color-gray-200)',
                      backgroundColor: (selectedCity === 'phoenix' ? callsForServiceStyle : baltimore311Style) === 'default' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    }}
                    onClick={() => handleBasemapStyleSelect('default')}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = (selectedCity === 'phoenix' ? callsForServiceStyle : baltimore311Style) === 'default' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.05)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = (selectedCity === 'phoenix' ? callsForServiceStyle : baltimore311Style) === 'default' ? 'rgba(59, 130, 246, 0.15)' : 'transparent' }}
                  >
                    <span>Default View</span>
                    {(selectedCity === 'phoenix' ? callsForServiceStyle : baltimore311Style) === 'default' && (
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-blue-400)' }}>Active</span>
                    )}
                  </button>
                  <button
                    className="w-full text-left px-2.5 py-2 text-sm rounded-md flex items-center justify-between transition-colors"
                    style={{
                      color: 'var(--color-gray-200)',
                      backgroundColor: (selectedCity === 'phoenix' ? callsForServiceStyle : baltimore311Style) === 'cluster' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    }}
                    onClick={() => handleBasemapStyleSelect('cluster')}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = (selectedCity === 'phoenix' ? callsForServiceStyle : baltimore311Style) === 'cluster' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.05)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = (selectedCity === 'phoenix' ? callsForServiceStyle : baltimore311Style) === 'cluster' ? 'rgba(59, 130, 246, 0.15)' : 'transparent' }}
                  >
                    <span>Cluster View</span>
                    {(selectedCity === 'phoenix' ? callsForServiceStyle : baltimore311Style) === 'cluster' && (
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-blue-400)' }}>Active</span>
                    )}
                  </button>
                  <button
                    className="w-full text-left px-2.5 py-2 text-sm rounded-md flex items-center justify-between transition-colors"
                    style={{
                      color: 'var(--color-gray-200)',
                      backgroundColor: (selectedCity === 'phoenix' ? callsForServiceStyle : baltimore311Style) === 'heatmap' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    }}
                    onClick={() => handleBasemapStyleSelect('heatmap')}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = (selectedCity === 'phoenix' ? callsForServiceStyle : baltimore311Style) === 'heatmap' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.05)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = (selectedCity === 'phoenix' ? callsForServiceStyle : baltimore311Style) === 'heatmap' ? 'rgba(59, 130, 246, 0.15)' : 'transparent' }}
                  >
                    <span>Heatmap</span>
                    {(selectedCity === 'phoenix' ? callsForServiceStyle : baltimore311Style) === 'heatmap' && (
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-blue-400)' }}>Active</span>
                    )}
                  </button>

                </div>
              </div>
            )}
          </div>
          <button
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-7 w-7"
            style={{ color: 'var(--color-gray-300)' }}
            title="Close"
            onClick={toggleLayers}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-gray-100)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-gray-300)'}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4" style={{ color: 'var(--color-gray-400)' }} aria-hidden="true" />
          <input
            className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors pl-8 focus-visible:outline-none focus-visible:ring-1"
            style={{
              backgroundColor: 'var(--sand-surface)',
              borderColor: 'var(--color-gray-700)',
              color: 'var(--color-gray-100)',
            }}
            placeholder="Search layers"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Date notice (Baltimore only) */}
        {selectedCity === 'baltimore' && (
          <div
            className="text-xs px-2 py-1.5 rounded-md"
            style={{ background: 'rgba(249,115,22,0.1)', color: 'rgba(249,115,22,0.9)', border: '1px solid rgba(249,115,22,0.2)' }}
          >
            {baltimore311DataYear === selectedYear ? (
              <>
                Showing data as of <strong>{selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                {Object.keys(baltimore311Types).length > 0 && ` · ${Object.keys(baltimore311Types).length} types available`}
                {Object.keys(baltimore311Types).length === 0 && ' · No data available'}
              </>
            ) : (
              <>Loading data for {selectedYear}...</>
            )}
          </div>
        )}

        {/* Categories */}
        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {filteredCategories.map((category) => (
            <div key={category.id}>
              <div
                className="flex items-center justify-between py-1.5 px-2.5 rounded-lg border min-h-[36px] sticky top-0 z-10"
                style={{
                  borderColor: 'var(--color-gray-600)',
                  backgroundColor: 'rgba(31, 41, 55, 0.95)',
                  backdropFilter: 'saturate(180%) blur(4px)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-gray-700)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(31, 41, 55, 0.95)'}
              >
                {/* Left: expand/collapse */}
                <div
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                  onClick={() => toggleCategory(category.id)}
                >
                  <div className="w-4 h-4 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                    {expandedCategories[category.id]
                      ? <ChevronDown className="w-3 h-3" aria-hidden="true" />
                      : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
                  </div>
                  <span className="text-[13px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                    {category.name}
                  </span>
                </div>
                
                {/* Right: Hide Closed toggle (Baltimore 311 only) */}
                {category.id === 'requests' && selectedCity === 'baltimore' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] opacity-50">Hide Closed</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={baltimore311HideClosed}
                      onClick={(e) => {
                        e.stopPropagation()
                        setBaltimore311HideClosed(!baltimore311HideClosed)
                      }}
                      className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      style={{
                        backgroundColor: baltimore311HideClosed ? '#fb923c' : 'rgba(255,255,255,0.1)',
                      }}
                    >
                      <span
                        className="pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                        style={{
                          transform: baltimore311HideClosed ? 'translateX(12px)' : 'translateX(0)',
                        }}
                      />
                    </button>
                  </div>
                )}

                {/* Right: Master toggle (Phoenix boundaries only) */}
                {category.id === 'phoenix-neighborhood-boundaries' && selectedCity === 'phoenix' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={getPhoenixVillagesMasterState() !== 'off'}
                      aria-label="Toggle all neighborhood boundaries"
                      className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      style={{
                        backgroundColor: getPhoenixVillagesMasterState() === 'off' ? 'rgba(255,255,255,0.1)' : '#3b82f6',
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleAllPhoenixVillages()
                      }}
                    >
                      {getPhoenixVillagesMasterState() === 'mixed' ? (
                        <Minus className="w-3 h-3 text-white absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
                      ) : (
                        <span
                          className="pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                          style={{
                            transform: getPhoenixVillagesMasterState() === 'on' ? 'translateX(12px)' : 'translateX(0)',
                          }}
                        />
                      )}
                    </button>
                  </div>
                )}

                {category.id === 'phoenix-council-district-boundaries' && selectedCity === 'phoenix' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={getPhoenixCouncilDistrictsMasterState() !== 'off'}
                      aria-label="Toggle all council district boundaries"
                      className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      style={{
                        backgroundColor: getPhoenixCouncilDistrictsMasterState() === 'off' ? 'rgba(255,255,255,0.1)' : '#3b82f6',
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleAllPhoenixCouncilDistricts()
                      }}
                    >
                      {getPhoenixCouncilDistrictsMasterState() === 'mixed' ? (
                        <Minus className="w-3 h-3 text-white absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
                      ) : (
                        <span
                          className="pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                          style={{
                            transform: getPhoenixCouncilDistrictsMasterState() === 'on' ? 'translateX(12px)' : 'translateX(0)',
                          }}
                        />
                      )}
                    </button>
                  </div>
                )}

                {/* Right: Situational Awareness master toggle (additive overlay) */}
                {category.isPhoenixSituationalAwareness && selectedCity === 'phoenix' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!phoenixSituationalAwareness?.master}
                      aria-label="Toggle Situational Awareness View"
                      className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      style={{
                        backgroundColor: phoenixSituationalAwareness?.master ? '#22d3ee' : 'rgba(255,255,255,0.10)',
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        togglePhoenixSituationalMaster()
                      }}
                    >
                      <span
                        className="pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                        style={{
                          transform: phoenixSituationalAwareness?.master ? 'translateX(12px)' : 'translateX(0)',
                        }}
                      />
                    </button>
                  </div>
                )}

                {/* Right: Phoenix master layer toggle (Calls / Heat & Homelessness — mutually exclusive) */}
                {selectedCity === 'phoenix' && (category.id === 'calls' || category.id === 'heat-homelessness') && (() => {
                  const bundleVis =
                    category.id === 'heat-homelessness'
                      ? getPhoenixHeatHomelessnessCategorySwitchVisualState()
                      : null
                  const masterActive =
                    category.id === 'heat-homelessness'
                      ? bundleVis !== 'off'
                      : phoenixActiveMasterLayer === category.id
                  return (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={masterActive}
                      aria-label={`Toggle ${category.name} master layer`}
                      className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      style={{
                        backgroundColor:
                          category.id === 'calls'
                            ? (phoenixActiveMasterLayer === category.id ? '#3b82f6' : 'rgba(255,255,255,0.10)')
                            : (bundleVis !== 'off' ? '#eab308' : 'rgba(255,255,255,0.10)'),
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (category.id === 'heat-homelessness') {
                          togglePhoenixHeatHomelessnessCategoryMaster()
                          return
                        }
                        setPhoenixActiveMasterLayer((prev) => (prev === category.id ? null : category.id))
                      }}
                    >
                      {category.id === 'heat-homelessness' && bundleVis === 'mixed' ? (
                        <Minus className="w-3 h-3 text-white absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
                      ) : (
                      <span
                        className="pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                        style={{
                          transform:
                            category.id === 'heat-homelessness'
                              ? (bundleVis === 'on' ? 'translateX(12px)' : 'translateX(0)')
                              : (phoenixActiveMasterLayer === category.id ? 'translateX(12px)' : 'translateX(0)'),
                        }}
                      />
                      )}
                    </button>
                  </div>
                  )
                })()}

              </div>

              {expandedCategories[category.id] && (category.layers.length > 0 || category.id === 'calls' || category.id === 'phoenix-neighborhood-boundaries' || category.id === 'phoenix-council-district-boundaries' || category.isPhoenixSituationalAwareness) && (
                <div className="space-y-1.5 mt-2 ml-4">
                  {category.isPhoenixSituationalAwareness && selectedCity === 'phoenix' && (() => {
                    const sa = phoenixSituationalAwareness || {}
                    const subRows = [
                      { key: 'heat',     label: 'Top 2 — Heat (forecast 16d)',  on: !!sa.heat,     setter: setPhoenixSituationalHeat,    accent: '#fb923c' },
                      { key: 'calls311', label: 'Top 1 — 311 (last 30d)',       on: !!sa.calls311, setter: setPhoenixSituational311,     accent: '#3b82f6' },
                      { key: 'housing',  label: 'Top 1 — Housing affordability', on: !!sa.housing,  setter: setPhoenixSituationalHousing, accent: '#a78bfa' },
                      { key: 'econ',     label: 'Top 1 — Biz openings (90d)',    on: !!sa.econ,     setter: setPhoenixSituationalEcon,    accent: '#34d399' },
                    ]
                    const masterOff = !sa.master
                    return (
                      <div className="space-y-1.5">
                        {subRows.map((row) => (
                          <div
                            key={row.key}
                            className="rounded-md border transition-colors px-2 py-1.5 flex items-center justify-between gap-2"
                            style={{
                              borderColor: row.on && !masterOff ? `${row.accent}55` : 'var(--color-gray-700)',
                              backgroundColor: row.on && !masterOff ? `${row.accent}14` : 'transparent',
                              opacity: masterOff ? 0.55 : 1,
                            }}
                          >
                            <span className="text-[11px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                              {row.label}
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={row.on}
                              aria-label={`Toggle ${row.label}`}
                              disabled={masterOff}
                              className="relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed"
                              style={{ backgroundColor: row.on && !masterOff ? row.accent : 'var(--color-gray-400)' }}
                              onClick={() => row.setter(!row.on)}
                            >
                              <span
                                className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
                                style={{ transform: row.on ? 'translateX(14px)' : 'translateX(0)' }}
                              />
                            </button>
                          </div>
                        ))}
                        <p className="text-[10px] leading-snug" style={{ color: 'var(--color-gray-500)' }}>
                          Highlights stack on the same district when categories overlap. Heat uses live forecast data; 311 / Housing / Biz are placeholders.
                        </p>
                      </div>
                    )
                  })()}

                  {/* Calls for Service (Phoenix) */}
                  {category.id === 'calls' && selectedCity === 'phoenix' && (
                    <>
                      <div className="mb-3">
                        <div
                          className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-lg border min-h-[36px]"
                          style={{
                            borderColor: 'var(--color-gray-600)',
                            backgroundColor: 'rgba(31, 41, 55, 0.95)',
                            backdropFilter: 'saturate(180%) blur(4px)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-gray-700)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(31, 41, 55, 0.95)' }}
                        >
                          <div
                            className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                            onClick={() => setExpandedCfsServiceTypes((v) => !v)}
                            role="button"
                            tabIndex={0}
                            aria-expanded={expandedCfsServiceTypes}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setExpandedCfsServiceTypes((v) => !v)
                              }
                            }}
                          >
                            <div className="w-4 h-4 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                              {expandedCfsServiceTypes ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
                            </div>
                            <span className="text-[13px] font-medium leading-tight truncate min-w-0" style={{ color: 'var(--color-gray-200)' }}>
                              Calls for Service Types
                            </span>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={callsForServiceVisible}
                            aria-label="Show or hide Calls for Service on the map and set all call types on or off"
                            className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                            style={{ backgroundColor: callsForServiceVisible ? '#3b82f6' : 'var(--color-gray-300)' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleCallsForServiceLayer()
                            }}
                          >
                            <span
                              className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                              style={{ transform: callsForServiceVisible ? 'translateX(16px)' : 'translateX(0)' }}
                            />
                          </button>
                        </div>

                        {expandedCfsServiceTypes && (
                          <div className="space-y-1.5 mt-2 ml-4">
                            {callsForServiceBuckets?.length > 0 ? (
                              <div className="space-y-1">
                                {callsForServiceBuckets.map((bucket) => {
                                  const bucketDef = CALLS_BUCKET_DEFS[bucket.bucketId] || { name: bucket.bucketName }
                                  const isExpanded = expandedCfsBuckets[bucket.bucketId]
                                  const bucketState = getCfsBucketToggleState(bucket)
                                  return (
                                    <div key={bucket.bucketId} className="space-y-1">
                                      <div
                                        className="rounded-lg border px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors"
                                        style={{
                                          borderColor: bucketState === 'off' ? 'var(--color-gray-600)' : 'rgba(59,130,246,0.35)',
                                          backgroundColor: bucketState === 'off' ? 'rgba(26, 29, 34, 0.15)' : 'rgba(59,130,246,0.06)',
                                        }}
                                      >
                                        <div
                                          className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                                          onClick={() => toggleCfsBucket(bucket.bucketId)}
                                        >
                                          <div className="w-3 h-3 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                                            {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                                          </div>
                                          <span className="text-[12px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                            {bucketDef.name}
                                          </span>
                                          <span className="text-[10px] opacity-50">({bucket.total})</span>
                                        </div>
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={bucketState !== 'off'}
                                          aria-label={`Toggle all call types in ${bucketDef.name}`}
                                          className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                                          style={{ backgroundColor: bucketState === 'off' ? 'var(--color-gray-300)' : '#3b82f6' }}
                                          onClick={(e) => { e.stopPropagation(); toggleCfsBucketTypes(bucket) }}
                                        >
                                          {bucketState === 'mixed' ? (
                                            <Minus className="w-3 h-3 text-white absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
                                          ) : (
                                            <span
                                              className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                                              style={{ transform: bucketState === 'on' ? 'translateX(16px)' : 'translateX(0)' }}
                                            />
                                          )}
                                        </button>
                                      </div>

                                      {isExpanded && (
                                        <div className="space-y-1 ml-3">
                                          {bucket.types.map((t) => {
                                            const isOn = callsForServiceTypes?.[t.typeName] !== false
                                            return (
                                              <div
                                                key={t.typeName}
                                                className="rounded-md border transition-colors px-2 py-1.5 flex items-center justify-between gap-2"
                                                style={{
                                                  borderColor: isOn ? 'rgba(59,130,246,0.25)' : 'var(--color-gray-700)',
                                                  backgroundColor: isOn ? 'rgba(59,130,246,0.06)' : 'transparent',
                                                }}
                                              >
                                                <span className="text-[11px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                                  {t.typeName}
                                                </span>
                                                <button
                                                  type="button"
                                                  role="switch"
                                                  aria-checked={isOn}
                                                  aria-label={`Toggle ${t.typeName}`}
                                                  className="relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                                                  style={{ backgroundColor: isOn ? '#3b82f6' : 'var(--color-gray-400)' }}
                                                  onClick={() => toggleCfsType(t.typeName)}
                                                >
                                                  <span
                                                    className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
                                                    style={{ transform: isOn ? 'translateX(14px)' : 'translateX(0)' }}
                                                  />
                                                </button>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <p className="text-xs py-1" style={{ color: 'var(--color-gray-500)' }}>
                                Loading Calls for Service…
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {callsForServiceNeedsGeocode && !cfsGeocodePromptDismissed && callsForServiceMeta?.status !== 'geocoding' && (
                        <div className="mt-2 rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2"
                          style={{ borderColor: 'var(--color-gray-700)', background: 'rgba(255,255,255,0.02)' }}
                        >
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold" style={{ color: 'var(--color-gray-200)' }}>
                              Start geocode?
                            </p>
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-gray-500)' }}>
                              {callsForServiceMissingGeocodeCount} addresses missing coordinates. Cached geocodes are preserved.
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              className="text-[11px] px-2 py-1 rounded-md border"
                              style={{ borderColor: 'var(--color-gray-700)', color: 'var(--color-gray-200)' }}
                              onClick={() => { setCfsGeocodePromptDismissed(true); startCallsForServiceGeocoding() }}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              className="text-[11px] px-2 py-1 rounded-md border"
                              style={{ borderColor: 'var(--color-gray-700)', color: 'var(--color-gray-400)' }}
                              onClick={() => setCfsGeocodePromptDismissed(true)}
                            >
                              No
                            </button>
                          </div>
                        </div>
                      )}

                      {(callsForServiceMeta?.status === 'geocoding' || callsForServiceMeta?.geocode?.total > 0) && (
                        <p className="text-[10px] mt-2" style={{ color: 'var(--color-gray-500)' }}>
                          Geocoding: {callsForServiceMeta.geocode.done}/{callsForServiceMeta.geocode.total} (2/sec rate-limited)
                        </p>
                      )}

                      <div
                        className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 transition-colors mb-3"
                        style={{
                          borderColor: 'rgba(59,130,246,0.35)',
                          backgroundColor: 'rgba(59,130,246,0.06)',
                        }}
                      >
                        <span className="text-[13px] font-semibold leading-tight truncate min-w-0" style={{ color: 'var(--color-gray-100)' }}>
                          Villages Boudaries
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={phoenixVillagesCfsRagVisible}
                          aria-label="Toggle Villages Boudaries (Calls for Service choropleth)"
                          className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                          style={{ backgroundColor: phoenixVillagesCfsRagVisible ? '#3b82f6' : 'var(--color-gray-300)' }}
                          onClick={togglePhoenixVillagesCfsRag}
                        >
                          <span
                            className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                            style={{ transform: phoenixVillagesCfsRagVisible ? 'translateX(16px)' : 'translateX(0)' }}
                          />
                        </button>
                      </div>

                      <div
                        className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 transition-colors mb-3"
                        style={{
                          borderColor: 'rgba(59,130,246,0.35)',
                          backgroundColor: 'rgba(59,130,246,0.06)',
                        }}
                      >
                        <span className="text-[13px] font-semibold leading-tight truncate min-w-0" style={{ color: 'var(--color-gray-100)' }}>
                          Council District Boundaries
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={phoenixCouncilDistrictsCfsRagVisible}
                          aria-label="Toggle Council District Boundaries (Calls for Service choropleth)"
                          className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                          style={{ backgroundColor: phoenixCouncilDistrictsCfsRagVisible ? '#3b82f6' : 'var(--color-gray-300)' }}
                          onClick={togglePhoenixCouncilDistrictsCfsRag}
                        >
                          <span
                            className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                            style={{ transform: phoenixCouncilDistrictsCfsRagVisible ? 'translateX(16px)' : 'translateX(0)' }}
                          />
                        </button>
                      </div>
                    </>
                  )}

                  {/* Neighborhood boundaries (Phoenix) */}
                  {category.id === 'phoenix-neighborhood-boundaries' && selectedCity === 'phoenix' && (
                    <>
                      {(() => {
                        const villages = Object.keys(phoenixVillagesEnabled || {}).sort()
                        return (
                          <>
                            {villages.length > 0 && (
                              <div className="space-y-1">
                                {villages.map((name) => {
                                  const isOn = phoenixVillagesEnabled?.[name] !== false
                                  return (
                                    <div
                                      key={name}
                                      className="rounded-md border transition-colors px-2 py-1.5 flex items-center justify-between gap-2"
                                      style={{
                                        borderColor: isOn ? 'rgba(59,130,246,0.28)' : 'var(--color-gray-700)',
                                        backgroundColor: isOn ? 'rgba(59,130,246,0.08)' : 'transparent',
                                      }}
                                    >
                                      <span className="text-[11px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                        {name}
                                      </span>
                                      <button
                                        type="button"
                                        role="switch"
                                        aria-checked={isOn}
                                        aria-label={`Toggle ${name}`}
                                        className="relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                                        style={{ backgroundColor: isOn ? '#3b82f6' : 'var(--color-gray-400)' }}
                                        onClick={() => togglePhoenixVillage(name)}
                                      >
                                        <span
                                          className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
                                          style={{ transform: isOn ? 'translateX(14px)' : 'translateX(0)' }}
                                        />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            <p className="text-[10px] leading-snug" style={{ color: 'var(--color-gray-500)' }}>
                              Phoenix neighborhood boundaries (villages) are shown on the map when enabled.
                            </p>
                          </>
                        )
                      })()}
                    </>
                  )}

                  {/* Council district boundaries (Phoenix) */}
                  {category.id === 'phoenix-council-district-boundaries' && selectedCity === 'phoenix' && (
                    <>
                      {(() => {
                        const districts = Object.keys(phoenixCouncilDistrictsEnabled || {})
                          .filter(Boolean)
                          .sort((a, b) => Number(a) - Number(b))
                        return (
                          <>
                            {districts.length > 0 && (
                              <div className="space-y-1">
                                {districts.map((districtId) => {
                                  const isOn = phoenixCouncilDistrictsEnabled?.[districtId] !== false
                                  return (
                                    <div
                                      key={districtId}
                                      className="rounded-md border transition-colors px-2 py-1.5 flex items-center justify-between gap-2"
                                      style={{
                                        borderColor: isOn ? 'rgba(59,130,246,0.28)' : 'var(--color-gray-700)',
                                        backgroundColor: isOn ? 'rgba(59,130,246,0.08)' : 'transparent',
                                      }}
                                    >
                                      <span className="text-[11px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                        District {districtId}
                                      </span>
                                      <button
                                        type="button"
                                        role="switch"
                                        aria-checked={isOn}
                                        aria-label={`Toggle District ${districtId}`}
                                        className="relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                                        style={{ backgroundColor: isOn ? '#3b82f6' : 'var(--color-gray-400)' }}
                                        onClick={() => togglePhoenixCouncilDistrict(districtId)}
                                      >
                                        <span
                                          className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
                                          style={{ transform: isOn ? 'translateX(14px)' : 'translateX(0)' }}
                                        />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            <p className="text-[10px] leading-snug" style={{ color: 'var(--color-gray-500)' }}>
                              Phoenix council district boundaries are shown on the map when enabled.
                            </p>
                          </>
                        )
                      })()}
                    </>
                  )}

                  {/* Global 311 toggle (only for Baltimore 311 Service Requests) */}
                  {category.id === 'requests' && selectedCity === 'baltimore' && Object.keys(baltimore311Types).length > 0 && (
                    <div
                      className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 transition-colors mb-3"
                      style={{
                        borderColor: 'rgba(249,115,22,0.5)',
                        backgroundColor: 'rgba(249,115,22,0.12)',
                      }}
                    >
                      <span className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--color-gray-100)' }}>
                        Show All 311 Requests
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={getGlobalToggleState() !== 'off'}
                        aria-label="Toggle all 311 requests"
                        className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                        style={{ backgroundColor: getGlobalToggleState() === 'off' ? 'var(--color-gray-300)' : '#f97316' }}
                        onClick={toggleAll311Types}
                      >
                        {getGlobalToggleState() === 'mixed' ? (
                          <Minus className="w-3 h-3 text-white absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
                        ) : (
                          <span
                            className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                            style={{ transform: getGlobalToggleState() === 'on' ? 'translateX(16px)' : 'translateX(0)' }}
                          />
                        )}
                      </button>
                    </div>
                  )}

                  {category.layers.map((layer) => {
                    if (layer.isPhoenixHeatStub) {
                      const tempOn = !!phoenixTemperatureNeighborhoodsVisible
                      const labelsOn = !!phoenixTemperatureNeighborhoodsLabelsVisible
                      const heatDeathsOn = !!phoenixHeatDeathsVisible
                      const heatDeathsLabelsOn = !!phoenixHeatDeathsLabelsVisible
                      const heatIllnessesOn = !!phoenixHeatIllnessesVisible
                      const heatMasterState = getPhoenixHeatMasterState()

                      const homelessnessLayer = category.layers.find((l) => l.isPhoenixHomelessnessLayer)
                      const homelessnessVisible = !!phoenixHomelessnessVisible
                      const snapshotLabel = phoenixHomelessnessSnapshot?.periodLabel
                      const status = phoenixHomelessnessMeta?.status
                      const message = phoenixHomelessnessMeta?.message
                      const categories = Object.keys(phoenixHomelessnessCategoryEnabled || {}).sort()
                      const snapshotValuesByCategory = new Map(
                        (phoenixHomelessnessSnapshot?.categories || [])
                          .filter((c) => c?.category && Number.isFinite(c?.value))
                          .map((c) => [c.category, c.value])
                      )

                      const toggleHeatAccordion = () => {
                        setExpandedPhoenixHeat((v) => !v)
                      }
                      const toggleHomelessnessAccordion = () => {
                        setExpandedPhoenixHomelessness((v) => !v)
                      }
                      const toggleCityServicesAccordion = () => {
                        setExpandedPhoenixCityServices((v) => !v)
                      }

                      const cityServicesMasterState = getPhoenixCityServicesMasterState()
                      const cityServicesRowActive = !!phoenixCoolingCentersVisible || !!phoenixHomelessnessVisible

                      const segmentedBtnStyle = (active) => ({
                        borderColor: active ? 'rgba(234,179,8,0.45)' : 'var(--color-gray-700)',
                        backgroundColor: active ? 'rgba(234,179,8,0.12)' : 'rgba(255,255,255,0.02)',
                        color: active ? 'var(--color-gray-100)' : 'var(--color-gray-300)',
                      })

                      const coolingSegmentedBtnStyle = (active) => ({
                        borderColor: active ? 'rgba(46,185,194,0.55)' : 'var(--color-gray-700)',
                        backgroundColor: active ? 'rgba(46,185,194,0.12)' : 'rgba(255,255,255,0.02)',
                        color: active ? 'var(--color-gray-100)' : 'var(--color-gray-300)',
                      })

                      const subAccordionHeaderStyle = (active) => ({
                        borderColor: active ? 'rgba(234,179,8,0.45)' : 'var(--color-gray-700)',
                        backgroundColor: active ? 'rgba(234,179,8,0.10)' : 'rgba(255,255,255,0.02)',
                      })

                      const renderHeatSubLayerToggle = (on, onClick, ariaLabel) => (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={ariaLabel}
                          className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                          style={{ backgroundColor: on ? '#eab308' : 'rgba(255,255,255,0.10)' }}
                          onClick={(e) => { e.stopPropagation(); onClick() }}
                        >
                          <span
                            className="pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                            style={{ transform: on ? 'translateX(12px)' : 'translateX(0)' }}
                          />
                        </button>
                      )

                      const setHeatTimeMode = (mode) => {
                        setPhoenixHeatIllnessesTimeMode(mode)
                      }

                      const renderShowNeighborhoodOverlay = () => (
                        <label className="flex items-center justify-between gap-2 rounded-md border px-2 py-2 text-[11px]"
                          style={{ borderColor: 'var(--color-gray-700)', background: 'rgba(255,255,255,0.02)', color: 'var(--color-gray-200)' }}
                        >
                          <span className="min-w-0 truncate">Show neighborhood overlay</span>
                          <input
                            type="checkbox"
                            checked={!!phoenixNeighborhoodBoundariesVisible}
                            onChange={() => setPhoenixNeighborhoodBoundariesVisible((v) => {
                              const next = !v
                              if (next) {
                                setPhoenixCouncilDistrictBoundariesVisible(false)
                                setPhoenixHomelessnessAffectedNeighborhoodsVisible(false)
                                setPhoenixVillagesCfsRagVisible(false)
                                setPhoenixCouncilDistrictsCfsRagVisible(false)
                              }
                              return next
                            })}
                            className="h-3.5 w-3.5 accent-yellow-500"
                          />
                        </label>
                      )

                      const renderShowDistrictOverlay = () => (
                        <label className="flex items-center justify-between gap-2 rounded-md border px-2 py-2 text-[11px]"
                          style={{ borderColor: 'var(--color-gray-700)', background: 'rgba(255,255,255,0.02)', color: 'var(--color-gray-200)' }}
                        >
                          <span className="min-w-0 truncate">Show district overlay</span>
                          <input
                            type="checkbox"
                            checked={!!phoenixCouncilDistrictBoundariesVisible}
                            onChange={() => setPhoenixCouncilDistrictBoundariesVisible((v) => {
                              const next = !v
                              if (next) {
                                setPhoenixNeighborhoodBoundariesVisible(false)
                                setPhoenixHomelessnessAffectedNeighborhoodsVisible(false)
                                setPhoenixVillagesCfsRagVisible(false)
                                setPhoenixCouncilDistrictsCfsRagVisible(false)
                              }
                              return next
                            })}
                            className="h-3.5 w-3.5 accent-yellow-500"
                          />
                        </label>
                      )

                      return (
                        <div key={layer.id} className="space-y-2">
                          {/* Heat parent accordion (master toggle for all 3 sub-layers) */}
                          <div
                            className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 transition-colors"
                            style={{
                              borderColor: heatMasterState !== 'off' ? 'rgba(234,179,8,0.45)' : 'var(--color-gray-600)',
                              backgroundColor: heatMasterState !== 'off' ? 'rgba(234,179,8,0.10)' : 'rgba(26, 29, 34, 0.15)',
                            }}
                          >
                            <div
                              className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                              onClick={toggleHeatAccordion}
                            >
                              <div className="w-3 h-3 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                                {expandedPhoenixHeat ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                              </div>
                              <div className="text-[12px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                Heat
                              </div>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={heatMasterState !== 'off'}
                              aria-label="Toggle Heat layers"
                              className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                              style={{ backgroundColor: heatMasterState === 'off' ? 'rgba(255,255,255,0.10)' : '#eab308' }}
                              onClick={(e) => { e.stopPropagation(); togglePhoenixHeatMaster() }}
                            >
                              {heatMasterState === 'mixed' ? (
                                <Minus className="w-3 h-3 text-white absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
                              ) : (
                                <span
                                  className="pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                                  style={{ transform: heatMasterState === 'on' ? 'translateX(12px)' : 'translateX(0)' }}
                                />
                              )}
                            </button>
                          </div>

                          {expandedPhoenixHeat && (
                            <div className="space-y-2 ml-3">
                              {/* Heat Illnesses sub-accordion */}
                              <div className="rounded-md border" style={subAccordionHeaderStyle(heatIllnessesOn)}>
                                <div className="flex items-center justify-between gap-2 px-2 py-2">
                                  <div
                                    className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                                    onClick={() => setExpandedPhoenixHeatIllnesses((v) => !v)}
                                  >
                                    <div className="w-3 h-3 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                                      {expandedPhoenixHeatIllnesses ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                                    </div>
                                    <div className="text-[12px] font-medium truncate" style={{ color: 'var(--color-gray-200)' }}>
                                      Heat Illnesses
                                    </div>
                                  </div>
                                  {renderHeatSubLayerToggle(heatIllnessesOn, togglePhoenixHeatIllnessesLayer, 'Toggle Heat Illnesses')}
                                </div>

                                {expandedPhoenixHeatIllnesses && (
                                  <div className="px-2 pb-2 space-y-2">
                                    {/* Breakdown */}
                                    <div className="space-y-1">
                                      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
                                        Breakdown
                                      </div>

                                      <div className="flex flex-wrap gap-1.5">
                                        <button
                                          type="button"
                                          className="text-[11px] px-2 py-1 rounded-md border"
                                          style={segmentedBtnStyle(Object.values(phoenixHeatIllnessesEnabled || {}).every((v) => v !== false))}
                                          onClick={togglePhoenixHeatIllnessesAll}
                                        >
                                        {`All illnesses (${phoenixHeatIllnessCounts.get('__ALL__') || 0})`}
                                        </button>
                                        {Object.keys(phoenixHeatIllnessesEnabled || {}).sort().map((illness) => {
                                          const active = phoenixHeatIllnessesEnabled?.[illness] !== false
                                          return (
                                            <button
                                              key={illness}
                                              type="button"
                                              className="text-[11px] px-2 py-1 rounded-md border"
                                              style={segmentedBtnStyle(active)}
                                              onClick={() => togglePhoenixHeatIllness(illness)}
                                            >
                                            {`${illness} (${phoenixHeatIllnessCounts.get(illness) || 0})`}
                                            </button>
                                          )
                                        })}
                                      </div>
                                    </div>

                                    {/* Time */}
                                    <div className="space-y-1">
                                      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
                                        Time
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          className="text-[11px] px-2 py-1 rounded-md border"
                                          style={segmentedBtnStyle(phoenixHeatIllnessesTimeMode === 'current')}
                                          onClick={() => setHeatTimeMode('current')}
                                        >
                                          Current Time
                                        </button>
                                        <button
                                          type="button"
                                          className="text-[11px] px-2 py-1 rounded-md border"
                                          style={segmentedBtnStyle(phoenixHeatIllnessesTimeMode === 'all_historical')}
                                          onClick={() => setHeatTimeMode('all_historical')}
                                        >
                                          Aggregated Historical Data
                                        </button>
                                      </div>
                                    </div>

                                    {/* View granularity (only when Current Time is active) */}
                                    {phoenixHeatIllnessesTimeMode === 'current' && (
                                      <div className="space-y-1">
                                        <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
                                          View
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            className="text-[11px] px-2 py-1 rounded-md border"
                                            style={segmentedBtnStyle(phoenixHeatIllnessesGranularity === 'week')}
                                            onClick={() => setPhoenixHeatIllnessesGranularity('week')}
                                          >
                                            Week
                                          </button>
                                          <button
                                            type="button"
                                            className="text-[11px] px-2 py-1 rounded-md border"
                                            style={segmentedBtnStyle(phoenixHeatIllnessesGranularity === 'month')}
                                            onClick={() => setPhoenixHeatIllnessesGranularity('month')}
                                          >
                                            Month
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {/* Map options */}
                                    <div className="space-y-1">
                                      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
                                        Map options
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          className="text-[11px] px-2 py-1 rounded-md border"
                                          style={segmentedBtnStyle(phoenixHeatIllnessesGeoView === 'districts')}
                                          onClick={() => setPhoenixHeatIllnessesGeoView('districts')}
                                        >
                                          Districts
                                        </button>
                                        <button
                                          type="button"
                                          className="text-[11px] px-2 py-1 rounded-md border"
                                          style={segmentedBtnStyle(phoenixHeatIllnessesGeoView === 'villages')}
                                          onClick={() => setPhoenixHeatIllnessesGeoView('villages')}
                                        >
                                          Villages
                                        </button>
                                      </div>

                                      <div className="space-y-1 mt-2 pt-2 border-t" style={{ borderColor: 'var(--color-gray-700)' }}>
                                        <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
                                          Area names
                                        </div>
                                        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Show or hide area names on heat illness map">
                                          <label className="flex items-center gap-2 cursor-pointer text-[11px]" style={{ color: 'var(--color-gray-200)' }}>
                                            <input
                                              type="radio"
                                              name="phoenix-heat-illness-area-labels"
                                              className="h-3 w-3 shrink-0 accent-yellow-500"
                                              checked={phoenixHeatIllnessGeoLabelsVisible}
                                              onChange={() => setPhoenixHeatIllnessGeoLabelsVisible(true)}
                                            />
                                            <span>Show {phoenixHeatIllnessesGeoView === 'villages' ? 'neighborhood' : 'district'} names</span>
                                          </label>
                                          <label className="flex items-center gap-2 cursor-pointer text-[11px]" style={{ color: 'var(--color-gray-200)' }}>
                                            <input
                                              type="radio"
                                              name="phoenix-heat-illness-area-labels"
                                              className="h-3 w-3 shrink-0 accent-yellow-500"
                                              checked={!phoenixHeatIllnessGeoLabelsVisible}
                                              onChange={() => setPhoenixHeatIllnessGeoLabelsVisible(false)}
                                            />
                                            <span>Hide names</span>
                                          </label>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Heat Deaths sub-accordion */}
                              <div className="rounded-md border" style={subAccordionHeaderStyle(false)}>
                                <div className="flex items-center justify-between gap-2 px-2 py-2">
                                  <div
                                    className="flex items-center gap-1.5 flex-1 min-w-0"
                                  >
                                    <div className="w-3 h-3 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                                      <ChevronRight className="w-2.5 h-2.5" />
                                    </div>
                                    <div className="text-[12px] font-medium truncate" style={{ color: 'var(--color-gray-200)' }}>
                                      Heat Deaths
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                      Disabled
                                    </span>
                                    <span
                                      className="inline-flex h-4 w-7 rounded-full p-[2px] border"
                                      style={{
                                        borderColor: 'rgba(255,255,255,0.10)',
                                        background: 'rgba(255,255,255,0.06)',
                                        opacity: 0.55,
                                      }}
                                      aria-hidden
                                    >
                                      <span className="h-3 w-3 rounded-full bg-white" style={{ opacity: 0.75 }} />
                                    </span>
                                  </div>
                                </div>

                                {/* Disabled (out of scope) */}
                              </div>

                              {/* Temperature sub-accordion */}
                              <div className="rounded-md border" style={subAccordionHeaderStyle(tempOn)}>
                                <div className="flex items-center justify-between gap-2 px-2 py-2">
                                  <div
                                    className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                                    onClick={() => setExpandedPhoenixTemperature((v) => !v)}
                                  >
                                    <div className="w-3 h-3 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                                      {expandedPhoenixTemperature ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                                    </div>
                                    <div className="text-[12px] font-medium truncate" style={{ color: 'var(--color-gray-200)' }}>
                                      Temperature
                                    </div>
                                  </div>
                                  {renderHeatSubLayerToggle(tempOn, togglePhoenixTemperatureLayer, 'Toggle Temperature')}
                                </div>

                                {expandedPhoenixTemperature && (
                                  <div className="px-2 pb-2 space-y-2">
                                    <div className="space-y-1">
                                      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
                                        Map options
                                      </div>
                                      <div className="flex flex-col gap-1.5 mt-2" role="radiogroup" aria-label="Temperature label options">
                                        <label className="flex items-center gap-2 cursor-pointer text-[11px]" style={{ color: 'var(--color-gray-200)' }}>
                                          <input
                                            type="radio"
                                            name="phoenix-temperature-labels"
                                            className="h-3 w-3 shrink-0 accent-yellow-500"
                                            checked={!!phoenixTemperatureNeighborhoodsLabelsVisible}
                                            onChange={() => setPhoenixTemperatureNeighborhoodsLabelsVisible(true)}
                                          />
                                          <span>Show Temp on the map</span>
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* City Services: Cooling Centers + Homelessness Services */}
                          <div
                            className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 transition-colors"
                            style={{
                              borderColor: cityServicesRowActive ? 'rgba(46,185,194,0.45)' : 'var(--color-gray-600)',
                              backgroundColor: cityServicesRowActive ? 'rgba(46,185,194,0.08)' : 'rgba(26, 29, 34, 0.15)',
                            }}
                          >
                            <div
                              className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                              onClick={toggleCityServicesAccordion}
                            >
                              <div className="w-3 h-3 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                                {expandedPhoenixCityServices ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                              </div>
                              <div className="text-[12px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                City Services
                              </div>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={cityServicesMasterState !== 'off'}
                              aria-label="Toggle City Services (Cooling Centers and Homelessness Services)"
                              className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                              style={{
                                backgroundColor: cityServicesMasterState === 'off' ? 'rgba(255,255,255,0.10)' : '#2dd4bf',
                              }}
                              onClick={(e) => { e.stopPropagation(); togglePhoenixCityServicesMaster() }}
                            >
                              {cityServicesMasterState === 'mixed' ? (
                                <Minus className="w-3 h-3 text-white absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
                              ) : (
                                <span
                                  className="pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                                  style={{ transform: cityServicesMasterState === 'on' ? 'translateX(12px)' : 'translateX(0)' }}
                                />
                              )}
                            </button>
                          </div>

                          {expandedPhoenixCityServices && (
                            <div className="space-y-2 ml-3">
                              <div className="rounded-md border px-2 py-2 space-y-1"
                                style={{ borderColor: 'var(--color-gray-700)', background: 'rgba(255,255,255,0.02)' }}
                              >
                                <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
                                  Map options
                                </div>
                                <div className="space-y-2">
                                  <div className="space-y-1">
                                    <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-gray-400)' }}>
                                      City distribution
                                    </div>
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <button
                                        type="button"
                                        className="text-[11px] px-2 py-1 rounded-md border"
                                        style={coolingSegmentedBtnStyle(String(phoenixCityServicesOverlayMode || 'none') === 'none')}
                                        onClick={() => setPhoenixCityServicesOverlayMode('none')}
                                      >
                                        None
                                      </button>
                                      <button
                                        type="button"
                                        className="text-[11px] px-2 py-1 rounded-md border"
                                        style={coolingSegmentedBtnStyle(String(phoenixCityServicesOverlayMode || 'none') === 'districts_distribution')}
                                        onClick={() => setPhoenixCityServicesOverlayMode('districts_distribution')}
                                      >
                                        Districts distribution
                                      </button>
                                      <button
                                        type="button"
                                        className="text-[11px] px-2 py-1 rounded-md border"
                                        style={coolingSegmentedBtnStyle(String(phoenixCityServicesOverlayMode || 'none') === 'district_capacity')}
                                        onClick={() => setPhoenixCityServicesOverlayMode('district_capacity')}
                                      >
                                        District capacity
                                      </button>
                                    </div>
                                  </div>

                                  <div className="space-y-1 pt-1 border-t" style={{ borderColor: 'var(--color-gray-700)' }}>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-gray-400)' }}>
                                      Temperature distribution
                                    </div>
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <button
                                        type="button"
                                        className="text-[11px] px-2 py-1 rounded-md border"
                                        style={segmentedBtnStyle(!phoenixTemperatureNeighborhoodsVisible)}
                                        onClick={() => {
                                          setPhoenixTemperatureNeighborhoodsVisible(false)
                                          setPhoenixTemperatureNeighborhoodsLabelsVisible(false)
                                        }}
                                      >
                                        None
                                      </button>
                                      <button
                                        type="button"
                                        className="text-[11px] px-2 py-1 rounded-md border"
                                        style={segmentedBtnStyle(!!phoenixTemperatureNeighborhoodsVisible)}
                                        onClick={() => {
                                          setPhoenixTemperatureNeighborhoodsVisible(true)
                                          setPhoenixTemperatureNeighborhoodsLabelsVisible(true)
                                        }}
                                      >
                                        Show Temperature
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Cooling Centers */}
                              <div
                                className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 transition-colors"
                                style={{
                                  borderColor: phoenixCoolingCentersVisible ? 'rgba(46,185,194,0.55)' : 'var(--color-gray-600)',
                                  backgroundColor: phoenixCoolingCentersVisible ? 'rgba(46,185,194,0.10)' : 'rgba(26, 29, 34, 0.15)',
                                }}
                              >
                                <div
                                  className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                                  onClick={() => setExpandedPhoenixCoolingCenters((v) => !v)}
                                >
                                  <div className="w-3 h-3 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                                    {expandedPhoenixCoolingCenters ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-[12px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                      Cooling Centers
                                    </div>
                                  </div>
                                </div>
                                {renderHeatSubLayerToggle(!!phoenixCoolingCentersVisible, togglePhoenixCoolingCentersLayer, 'Toggle Cooling Centers')}
                              </div>

                              {expandedPhoenixCoolingCenters && (
                                <div className="space-y-1 ml-3">
                                  <div className="rounded-md border px-2 py-2 space-y-1"
                                    style={{ borderColor: 'var(--color-gray-700)', background: 'rgba(255,255,255,0.02)' }}
                                  >
                                    <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-gray-500)' }}>
                                      Time
                                    </div>
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <button
                                        type="button"
                                        className="text-[11px] px-2 py-1 rounded-md border"
                                        style={coolingSegmentedBtnStyle(String(phoenixCoolingCentersTimeMode || 'current') === 'current')}
                                        onClick={() => setPhoenixCoolingCentersTimeMode('current')}
                                      >
                                        Current Time
                                      </button>
                                      <button
                                        type="button"
                                        className="text-[11px] px-2 py-1 rounded-md border"
                                        style={coolingSegmentedBtnStyle(String(phoenixCoolingCentersTimeMode || 'current') === 'all_historical')}
                                        onClick={() => setPhoenixCoolingCentersTimeMode('all_historical')}
                                      >
                                        Aggregated Data
                                      </button>
                                    </div>

                                    {phoenixCoolingWeekSummary?.ok ? (
                                      <div
                                        className="rounded-md border px-2 py-2 text-[10px] leading-snug"
                                        style={{
                                          borderColor: 'rgba(46,185,194,0.35)',
                                          background: 'rgba(46,185,194,0.06)',
                                          color: 'var(--color-gray-300)',
                                        }}
                                      >
                                        {phoenixCoolingWeekSummary.mode === 'all_historical' ? (
                                          <>
                                            <div
                                              className="text-[10px] font-semibold uppercase tracking-wide"
                                              style={{ color: 'rgba(46,185,194,0.95)' }}
                                            >
                                              All recorded visits
                                            </div>
                                            <div className="mt-1" style={{ color: 'var(--color-gray-200)' }}>
                                              {phoenixCoolingWeekSummary.weekRangeLabel}
                                            </div>
                                            <div className="mt-1 opacity-90">
                                              Data from <strong>{phoenixCoolingWeekSummary.dataStartLabel}</strong>
                                              {' to '}
                                              <strong>{phoenixCoolingWeekSummary.dataEndLabel}</strong>
                                              {' · '}
                                              {phoenixCoolingWeekSummary.totalVisits.toLocaleString()} visits
                                              {' · '}
                                              {phoenixCoolingWeekSummary.mappedLocationCount} dots on map
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <div
                                              className="text-[10px] font-semibold uppercase tracking-wide"
                                              style={{ color: 'rgba(46,185,194,0.95)' }}
                                            >
                                              Reporting week (calendar)
                                            </div>
                                            <div className="mt-1" style={{ color: 'var(--color-gray-200)' }}>
                                              {phoenixCoolingWeekSummary.weekRangeLabel}
                                            </div>
                                            <div className="mt-1 opacity-90">
                                              As of <strong>{phoenixCoolingWeekSummary.asOfLabel}</strong>
                                              {' · '}
                                              {phoenixCoolingWeekSummary.totalVisits.toLocaleString()} visits
                                              {' · '}
                                              {phoenixCoolingWeekSummary.mappedLocationCount} dots on map
                                            </div>
                                            <div className="mt-1 opacity-75" style={{ fontSize: 10 }}>
                                              Next 16 days forecast (planning estimate) is available on the map tooltips.
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    ) : phoenixCoolingWeekSummary && !phoenixCoolingWeekSummary.ok ? (
                                      <div className="text-[10px] opacity-70 px-0.5">
                                        Cooling data: {phoenixCoolingWeekSummary.label || 'Unavailable'}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              )}

                              {/* Homelessness Services */}
                              {homelessnessLayer && (
                                <div
                                  className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 transition-colors"
                                  style={{
                                    borderColor: homelessnessVisible ? 'rgba(234,179,8,0.45)' : 'var(--color-gray-600)',
                                    backgroundColor: homelessnessVisible ? 'rgba(234,179,8,0.10)' : 'rgba(26, 29, 34, 0.15)',
                                  }}
                                >
                                  <div
                                    className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                                    onClick={toggleHomelessnessAccordion}
                                  >
                                    <div className="w-3 h-3 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                                      {expandedPhoenixHomelessness ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-[12px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                        Homelessness Services
                                      </div>
                                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-gray-500)' }}>
                                        {status === 'loading'
                                          ? 'Loading CSV…'
                                          : status === 'error'
                                            ? 'CSV load error'
                                            : snapshotLabel
                                              ? (String(phoenixHomelessnessTimeMode || 'all_historical') === 'current'
                                                ? `People served (${snapshotLabel})`
                                                : (() => {
                                                  const asOfMs = phoenixHomelessnessSnapshot?.periodMs
                                                  const asOfLabel = asOfMs
                                                    ? new Date(asOfMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                                    : null
                                                  return asOfLabel ? `All time (as of ${asOfLabel})` : 'All time'
                                                })())
                                              : (String(phoenixHomelessnessTimeMode || 'all_historical') === 'current'
                                                ? 'No data available for selected month'
                                                : 'No data available')}
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={homelessnessVisible}
                                    aria-label="Toggle Phoenix homelessness services layer"
                                    className="relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                                    style={{ backgroundColor: homelessnessVisible ? '#eab308' : 'var(--color-gray-400)' }}
                                    onClick={() => setPhoenixHomelessnessVisible((prev) => {
                                      const next = !prev
                                      if (next) {
                                        enforcePhoenixHeatHomelessnessPrimaryExclusivity('homeless')
                                        activateHeatMasterIfNeeded()
                                      }
                                      return next
                                    })}
                                  >
                                    <span
                                      className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
                                      style={{ transform: homelessnessVisible ? 'translateX(14px)' : 'translateX(0)' }}
                                    />
                                  </button>
                                </div>
                              )}

                              {expandedPhoenixHomelessness && categories.length > 0 && (
                                <div className="space-y-1 ml-3">
                                  <div
                                    className="rounded-md border px-2 py-2 space-y-1"
                                    style={{ borderColor: 'var(--color-gray-700)', background: 'rgba(255, 255, 255, 0.02)' }}
                                  >
                                    <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90" style={{ color: 'var(--color-gray-400)' }}>
                                      Time
                                    </div>
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <button
                                        type="button"
                                        className="text-[11px] px-2 py-1 rounded-md border"
                                        style={segmentedBtnStyle(String(phoenixHomelessnessTimeMode || 'all_historical') === 'current')}
                                        onClick={() => setPhoenixHomelessnessTimeMode('current')}
                                      >
                                        Current Time
                                      </button>
                                      <button
                                        type="button"
                                        className="text-[11px] px-2 py-1 rounded-md border"
                                        style={segmentedBtnStyle(String(phoenixHomelessnessTimeMode || 'all_historical') === 'all_historical')}
                                        onClick={() => setPhoenixHomelessnessTimeMode('all_historical')}
                                      >
                                        Aggregated Data
                                      </button>
                                    </div>

                                    {phoenixHomelessnessSnapshot ? (
                                      <div className="rounded-md border px-2 py-2 text-[10px] leading-snug mt-1"
                                        style={{ borderColor: 'rgba(234,179,8,0.35)', background: 'rgba(234,179,8,0.06)', color: 'var(--color-gray-300)' }}
                                      >
                                        {String(phoenixHomelessnessTimeMode || 'all_historical') === 'current' ? (
                                          <>
                                            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(234,179,8,0.95)' }}>
                                              People served (month)
                                            </div>
                                            <div className="mt-1" style={{ color: 'var(--color-gray-200)' }}>
                                              {phoenixHomelessnessSnapshot.periodLabel}
                                            </div>
                                            <div className="mt-1 opacity-90">
                                              {Array.from(snapshotValuesByCategory.values()).reduce((a, b) => a + (Number.isFinite(b) ? Number(b) : 0), 0).toLocaleString()} people served
                                            </div>
                                            <div className="mt-1 opacity-75" style={{ fontSize: 10 }}>
                                              Next 16 days forecast (planning estimate) is available on the map tooltips.
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(234,179,8,0.95)' }}>
                                              All time people served
                                            </div>
                                            <div className="mt-1" style={{ color: 'var(--color-gray-200)' }}>
                                              As of {phoenixHomelessnessSnapshot.periodMs
                                                ? new Date(phoenixHomelessnessSnapshot.periodMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                                : '—'}
                                            </div>
                                            <div className="mt-1 opacity-90">
                                              {Array.from(snapshotValuesByCategory.values()).reduce((a, b) => a + (Number.isFinite(b) ? Number(b) : 0), 0).toLocaleString()} people served
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>

                                  {categories.map((catName) => {
                                    const isOn = phoenixHomelessnessCategoryEnabled?.[catName] !== false
                                    const served = snapshotValuesByCategory.has(catName) ? snapshotValuesByCategory.get(catName) : null
                                    const servedLabel = Number.isFinite(served) ? ` (${Number(served).toLocaleString()})` : ''
                                    return (
                                      <div
                                        key={catName}
                                        className="rounded-md border transition-colors px-2 py-1.5 flex items-center justify-between gap-2"
                                        style={{
                                          borderColor: isOn ? 'rgba(234,179,8,0.30)' : 'var(--color-gray-700)',
                                          backgroundColor: isOn ? 'rgba(234,179,8,0.07)' : 'transparent',
                                        }}
                                      >
                                        <span className="text-[11px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                          {catName}{servedLabel}
                                        </span>
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={isOn}
                                          aria-label={`Toggle ${catName}`}
                                          className="relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                                          style={{ backgroundColor: isOn ? '#eab308' : 'var(--color-gray-400)' }}
                                          onClick={() => togglePhoenixHomelessnessCategory(catName)}
                                        >
                                          <span
                                            className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
                                            style={{ transform: isOn ? 'translateX(14px)' : 'translateX(0)' }}
                                          />
                                        </button>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                              {expandedPhoenixHomelessness && status === 'error' && message && (
                                <p className="text-[10px] ml-3 px-1" style={{ color: 'rgba(248,113,113,0.85)' }}>
                                  {message}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    }

                    if (layer.isPhoenixHomelessnessLayer) {
                      // Rendered inside the Heat block as a nested accordion.
                      return null
                    }

                    if (layer.isPhoenix311Stub) {
                      return (
                        <div
                          key={layer.id}
                          className="rounded-lg border px-2.5 py-2 space-y-2"
                          style={{
                            borderColor: 'var(--color-gray-600)',
                            backgroundColor: 'rgba(26, 29, 34, 0.15)',
                          }}
                        >
                          <p className="text-[12px] leading-snug" style={{ color: 'var(--color-gray-400)' }}>
                            Phoenix 311 requests are not loaded in this build. Type and status toggles will appear here after a dataset is connected.
                          </p>
                          <p className="text-[11px] leading-snug" style={{ color: 'var(--color-gray-500)' }}>
                            No map points are rendered for Phoenix 311.
                          </p>
                        </div>
                      )
                    }

                    // Phoenix neighborhood boundaries are rendered as their own top-level category (not as a layer row)

                    // Bucket rendering (nested accordion with toggle-all)
                    if (layer.isBucket) {
                      const bucketState = getBucketToggleState(layer.types)
                      const requestCount = getBucketRequestCount(layer.types)
                      // Auto-expand bucket if it's filtered (search resulted in type matches)
                      const isExpanded = expandedBuckets[layer.bucketId] || layer.isFiltered
                      
                      return (
                        <div key={layer.id} className="space-y-1">
                          {/* Bucket header */}
                          <div
                            className="rounded-lg border px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors"
                            style={{
                              borderColor: bucketState === 'off' ? 'var(--color-gray-600)' : 'rgba(249,115,22,0.35)',
                              backgroundColor: bucketState === 'off' ? 'rgba(26, 29, 34, 0.15)' : 'rgba(249,115,22,0.08)',
                            }}
                          >
                            {/* Left: expand/collapse */}
                            <div
                              className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                              onClick={() => toggleBucket(layer.bucketId)}
                            >
                              <div className="w-3 h-3 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                                {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                              </div>
                              <span className="text-[12px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                {layer.name}
                              </span>
                              <span className="text-[10px] opacity-50">({requestCount})</span>
                            </div>
                            
                            {/* Right: toggle all in bucket */}
                            <button
                              type="button"
                              role="switch"
                              aria-checked={bucketState === 'on'}
                              aria-label={`Toggle all ${layer.name}`}
                              className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors scale-85"
                              style={{ backgroundColor: bucketState === 'off' ? 'var(--color-gray-300)' : '#f97316' }}
                              onClick={(e) => { e.stopPropagation(); toggleBucketTypes(layer.bucketId, layer.types) }}
                            >
                              {bucketState === 'mixed' ? (
                                <Minus className="w-3 h-3 text-white absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
                              ) : (
                                <span
                                  className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                                  style={{ transform: bucketState === 'on' ? 'translateX(16px)' : 'translateX(0)' }}
                                />
                              )}
                            </button>
                          </div>

                          {/* Bucket types (nested) */}
                          {isExpanded && (
                            <div className="space-y-1 ml-3">
                              {layer.types.map((typeName) => {
                                const isOn = baltimore311Types[typeName]
                                return (
                                  <div
                                    key={typeName}
                                    className="rounded-md border transition-colors px-2 py-1.5 flex items-center justify-between gap-2"
                                    style={{
                                      borderColor: isOn ? 'rgba(249,115,22,0.3)' : 'var(--color-gray-700)',
                                      backgroundColor: isOn ? 'rgba(249,115,22,0.06)' : 'transparent',
                                    }}
                                  >
                                    <span className="text-[11px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                      {typeName}
                                    </span>
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={isOn}
                                      aria-label={`Toggle ${typeName}`}
                                      className="relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                                      style={{ backgroundColor: isOn ? '#f97316' : 'var(--color-gray-400)' }}
                                      onClick={() => toggle311Type(typeName)}
                                    >
                                      <span
                                        className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
                                        style={{ transform: isOn ? 'translateX(14px)' : 'translateX(0)' }}
                                      />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    }

                    // Health layer rendering (Overdose & Naloxone)
                    if (layer.isHealthLayer) {
                      const isOverdose = layer.healthType === 'overdose'
                      const isVisible = isOverdose ? healthOverdoseVisible : healthNaloxoneVisible
                      const count = getHealthCategoryCount(layer.id, isOverdose)
                      const filters = isOverdose ? healthOverdoseFilters : healthNaloxoneFilters
                      const isExpanded = expandedHealthCategories[layer.id] || layer.isFiltered
                      
                      return (
                        <div key={layer.id} className="space-y-1">
                          {/* Health layer header */}
                          <div
                            className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 transition-colors"
                            style={{
                              borderColor: isVisible ? (isOverdose ? 'rgba(220,38,38,0.35)' : 'rgba(16,185,129,0.35)') : 'var(--color-gray-600)',
                              backgroundColor: isVisible ? (isOverdose ? 'rgba(220,38,38,0.08)' : 'rgba(16,185,129,0.08)') : 'rgba(26, 29, 34, 0.15)',
                            }}
                          >
                            {/* Left: expand/collapse */}
                            <div
                              className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                              onClick={() => toggleHealthCategory(layer.id)}
                            >
                              <div className="w-3 h-3 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                                {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                              </div>
                              <span className="text-[12px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                {layer.name}
                              </span>
                              <span className="text-[10px] opacity-50">({count})</span>
                            </div>
                            
                            {/* Right: master toggle for this layer */}
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isVisible}
                              aria-label={`Toggle ${layer.name}`}
                              className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors scale-85"
                              style={{ backgroundColor: isVisible ? (isOverdose ? '#dc2626' : '#10b981') : 'var(--color-gray-300)' }}
                              onClick={(e) => { 
                                e.stopPropagation()
                                if (isOverdose) setHealthOverdoseVisible(!isVisible)
                                else setHealthNaloxoneVisible(!isVisible)
                              }}
                            >
                              <span
                                className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                                style={{ transform: isVisible ? 'translateX(16px)' : 'translateX(0)' }}
                              />
                            </button>
                          </div>

                          {/* Filter categories (nested) */}
                          {isExpanded && (
                            <div className="space-y-2 ml-3">
                              {Object.entries(layer.filterCategories).map(([catId, category]) => {
                                const categoryFilters = getFiltersByCategory(filters, { [catId]: category })[catId]
                                const isExpanded = expandedHealthCategories[`${layer.id}-${catId}`]
                                
                                return (
                                  <div key={catId} className="space-y-1">
                                    {/* Filter category header */}
                                    <div
                                      className="rounded-md border px-2 py-1.5 flex items-center gap-1.5 cursor-pointer transition-colors"
                                      style={{
                                        borderColor: 'var(--color-gray-700)',
                                        backgroundColor: 'rgba(26, 29, 34, 0.2)',
                                      }}
                                      onClick={() => toggleHealthCategory(`${layer.id}-${catId}`)}
                                    >
                                      <div className="w-3 h-3 flex items-center justify-center shrink-0" style={{ color: 'var(--color-gray-400)' }}>
                                        {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                                      </div>
                                      <span className="text-[11px] font-medium leading-tight" style={{ color: 'var(--color-gray-300)' }}>
                                        {category.name}
                                      </span>
                                    </div>
                                    
                                    {/* Filter options */}
                                    {isExpanded && (
                                      <div className="space-y-1 ml-3">
                                        {categoryFilters.options.map(option => (
                                          <div
                                            key={option.key}
                                            className="rounded-md border transition-colors px-2 py-1 flex items-center justify-between gap-2"
                                            style={{
                                              borderColor: option.enabled ? (isOverdose ? 'rgba(220,38,38,0.25)' : 'rgba(16,185,129,0.25)') : 'var(--color-gray-700)',
                                              backgroundColor: option.enabled ? (isOverdose ? 'rgba(220,38,38,0.05)' : 'rgba(16,185,129,0.05)') : 'transparent',
                                            }}
                                          >
                                            <span className="text-[10px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-200)' }}>
                                              {option.label}
                                            </span>
                                            <button
                                              type="button"
                                              role="switch"
                                              aria-checked={option.enabled}
                                              aria-label={`Toggle ${option.label}`}
                                              className="relative inline-flex h-3.5 w-7 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                                              style={{ backgroundColor: option.enabled ? (isOverdose ? '#dc2626' : '#10b981') : 'var(--color-gray-400)' }}
                                              onClick={() => toggleHealthFilter(option.key)}
                                            >
                                              <span
                                                className="pointer-events-none absolute left-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-transform"
                                                style={{ transform: option.enabled ? 'translateX(12px)' : 'translateX(0)' }}
                                              />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    }

                    // Regular layer rendering (STL layers)
                    return (
                      <div
                        key={layer.id}
                        className="rounded-lg border transition-colors px-2.5 py-2 flex items-center justify-between gap-2"
                        style={{
                          borderColor: layerStates[layer.id] ? 'var(--color-blue-500)' : 'var(--color-gray-600)',
                          backgroundColor: layerStates[layer.id] ? 'rgba(59, 130, 246, 0.35)' : 'rgba(26, 29, 34, 0.15)',
                        }}
                      >
                        <span className="text-[13px] font-medium leading-tight truncate" style={{ color: 'var(--color-gray-100)' }}>
                          {layer.name}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={layerStates[layer.id] || false}
                          aria-label={`Toggle ${layer.name}`}
                          className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors scale-85"
                          style={{ backgroundColor: layerStates[layer.id] ? 'var(--color-blue-600)' : 'var(--color-gray-300)' }}
                          onClick={() => toggleLayer(layer.id)}
                        >
                          <span
                            className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                            style={{ transform: layerStates[layer.id] ? 'translateX(16px)' : 'translateX(0)' }}
                          />
                        </button>
                      </div>
                    )
                  })}

                  {/* Neighborhood Boundaries (only for Baltimore 311 Service Requests, after all buckets) */}
                  {category.id === 'requests' && selectedCity === 'baltimore' && Object.keys(baltimore311Types).length > 0 && (
                    <>
                      <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--color-gray-700)' }}>
                        <div className="text-[11px] font-semibold mb-2 opacity-60" style={{ color: 'var(--color-gray-300)' }}>
                          NEIGHBORHOOD BOUNDARIES
                        </div>

                        {/* Show Affected Neighborhoods */}
                        <div
                          className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 transition-colors mb-2"
                          style={{
                            borderColor: baltimoreNeighborhoodsAffected ? 'rgba(59,130,246,0.5)' : 'var(--color-gray-600)',
                            backgroundColor: baltimoreNeighborhoodsAffected ? 'rgba(59,130,246,0.12)' : 'transparent',
                            opacity: hasAny311TypeEnabled ? 1 : 0.4,
                            cursor: hasAny311TypeEnabled ? 'pointer' : 'not-allowed',
                          }}
                          onClick={() => {
                            if (hasAny311TypeEnabled) {
                              setBaltimoreNeighborhoodsAffected(!baltimoreNeighborhoodsAffected)
                              if (!baltimoreNeighborhoodsAffected && baltimoreNeighborhoodsAll) {
                                setBaltimoreNeighborhoodsAll(false)
                              }
                            }
                          }}
                        >
                          <span className="text-[12px] font-medium leading-tight" style={{ color: 'var(--color-gray-200)' }}>
                            Show Affected Neighborhoods
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={baltimoreNeighborhoodsAffected}
                            aria-label="Show neighborhoods with open 311 requests"
                            disabled={!hasAny311TypeEnabled}
                            className="relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                            style={{ backgroundColor: baltimoreNeighborhoodsAffected ? '#3b82f6' : 'var(--color-gray-400)' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (hasAny311TypeEnabled) {
                                setBaltimoreNeighborhoodsAffected(!baltimoreNeighborhoodsAffected)
                                if (!baltimoreNeighborhoodsAffected && baltimoreNeighborhoodsAll) {
                                  setBaltimoreNeighborhoodsAll(false)
                                }
                              }
                            }}
                          >
                            <span
                              className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
                              style={{ transform: baltimoreNeighborhoodsAffected ? 'translateX(14px)' : 'translateX(0)' }}
                            />
                          </button>
                        </div>

                        {/* Show All Neighborhoods */}
                        <div
                          className="rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 transition-colors mb-2"
                          style={{
                            borderColor: baltimoreNeighborhoodsAll ? 'rgba(59,130,246,0.5)' : 'var(--color-gray-600)',
                            backgroundColor: baltimoreNeighborhoodsAll ? 'rgba(59,130,246,0.12)' : 'transparent',
                            opacity: hasAny311TypeEnabled ? 1 : 0.4,
                            cursor: hasAny311TypeEnabled ? 'pointer' : 'not-allowed',
                          }}
                          onClick={() => {
                            if (hasAny311TypeEnabled) {
                              setBaltimoreNeighborhoodsAll(!baltimoreNeighborhoodsAll)
                              if (!baltimoreNeighborhoodsAll && baltimoreNeighborhoodsAffected) {
                                setBaltimoreNeighborhoodsAffected(false)
                              }
                            }
                          }}
                        >
                          <span className="text-[12px] font-medium leading-tight" style={{ color: 'var(--color-gray-200)' }}>
                            Show All Neighborhoods
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={baltimoreNeighborhoodsAll}
                            aria-label="Show all neighborhoods"
                            disabled={!hasAny311TypeEnabled}
                            className="relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                            style={{ backgroundColor: baltimoreNeighborhoodsAll ? '#3b82f6' : 'var(--color-gray-400)' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (hasAny311TypeEnabled) {
                                setBaltimoreNeighborhoodsAll(!baltimoreNeighborhoodsAll)
                                if (!baltimoreNeighborhoodsAll && baltimoreNeighborhoodsAffected) {
                                  setBaltimoreNeighborhoodsAffected(false)
                                }
                              }
                            }}
                          >
                            <span
                              className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
                              style={{ transform: baltimoreNeighborhoodsAll ? 'translateX(14px)' : 'translateX(0)' }}
                            />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {expandedCategories[category.id] && category.layers.length === 0 && (
                <p className="text-xs px-4 py-2 ml-4" style={{ color: 'var(--color-gray-500)' }}>
                  No layers available yet.
                </p>
              )}
            </div>
          ))}

        </div>
      </div>
    </div>
  )
}

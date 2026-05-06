import { useEffect, useMemo, useState } from 'react'
import { usePanelContext } from '../contexts/PanelContext'
import { buildPhoenixCoolingCentersGeojson } from '../utils/phoenixCoolingCentersGeojson'

function haversineKm(lng1, lat1, lng2, lat2) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

function fmtMiFromKm(km) {
  if (!Number.isFinite(km)) return '—'
  const mi = km * 0.621371
  if (mi < 1) return `${Math.round(mi * 5280)} ft`
  return `${mi.toFixed(mi < 10 ? 1 : 0)} mi`
}

function fmtMilesFromKm(km) {
  if (!Number.isFinite(km)) return '—'
  const mi = km * 0.621371
  return mi.toFixed(mi < 10 ? 1 : 0)
}

export default function AlertActionDialog() {
  const {
    selectedCity,
    selectedDate,
    phoenixHeatAlertsSelection,
    setPhoenixHeatAlertsSelection,
    phoenixHeatAlertsDialogOpen,
    setPhoenixHeatAlertsDialogOpen,
    phoenixHeatAlertsRedirectTarget,
    setPhoenixHeatAlertsRedirectTarget,
    createWorkOrder,
    requestMapFocus,
  } = usePanelContext()

  const open = selectedCity === 'phoenix' && !!phoenixHeatAlertsDialogOpen && !!phoenixHeatAlertsSelection
  const peak = phoenixHeatAlertsSelection
  const [centers, setCenters] = useState([])
  const [status, setStatus] = useState({ state: 'idle', message: null }) // idle | loading | ready | error

  useEffect(() => {
    let cancelled = false
    if (!open) {
      setCenters([])
      setStatus({ state: 'idle', message: null })
      return
    }

    ;(async () => {
      setStatus({ state: 'loading', message: null })
      try {
        const geo = await buildPhoenixCoolingCentersGeojson(selectedDate, { mode: 'current' })
        const feats = geo?.features || []
        const all = feats
          .map((f) => {
            const c = f?.geometry?.type === 'Point' ? f.geometry.coordinates : null
            if (!Array.isArray(c) || c.length < 2) return null
            const p = f.properties || {}
            const dKm = peak ? haversineKm(peak.lng, peak.lat, c[0], c[1]) : null
            const cap = Number(p.capacityEstimate)
            const vc = Number(p.visitCount)
            const loadRatio = Number.isFinite(cap) && cap > 0 && Number.isFinite(vc) ? vc / cap : null
            const hasCapacity = Number.isFinite(cap) && cap > 0
            const notFull = hasCapacity && loadRatio != null ? loadRatio < 1 : false
            return {
              id: String(p.siteKey || p.name || `${c[0]},${c[1]}`),
              name: String(p.name || 'Cooling center'),
              address: String(p.address || '').trim(),
              councilDistrict: String(p.councilDistrict || '').trim(),
              lng: Number(c[0]),
              lat: Number(c[1]),
              distanceKm: dKm,
              capacityEstimate: Number.isFinite(cap) ? cap : null,
              visitCount: Number.isFinite(vc) ? vc : null,
              loadRatio,
              hasCapacity,
              notFull,
            }
          })
          .filter(Boolean)

        // Priority:
        // 1) closest centers (distance)
        // 2) within the closest set, prefer those with known capacity AND not full
        const byDistance = all
          .slice()
          .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))

        const preferred = byDistance.filter((c) => c.hasCapacity && c.notFull)
        const picked = preferred.slice(0, 6)
        if (picked.length < 6) {
          const pickedIds = new Set(picked.map((c) => c.id))
          for (const c of byDistance) {
            if (picked.length >= 6) break
            if (pickedIds.has(c.id)) continue
            picked.push(c)
            pickedIds.add(c.id)
          }
        }

        if (cancelled) return
        setCenters(picked)
        setStatus({ state: 'ready', message: null })
      } catch (err) {
        if (cancelled) return
        setCenters([])
        setStatus({ state: 'error', message: err?.message || 'Failed to load cooling centers' })
      }
    })()

    return () => { cancelled = true }
  }, [open, selectedDate, peak?.lng, peak?.lat])

  const header = useMemo(() => {
    const d = selectedDate instanceof Date ? selectedDate : new Date()
    const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const kind = String(peak?.dataKind || '')
    const kindLabel = kind === 'forecast' ? 'Forecast' : kind === 'historical' ? 'Observed' : kind ? kind : '—'
    return { dateLabel, kindLabel }
  }, [selectedDate, peak?.dataKind])

  const estimates = useMemo(() => {
    const est = Number(peak?.estimatedCases)
    const rKm = Number(peak?.estimatedCasesRadiusKm)
    return {
      estCases: Number.isFinite(est) ? est : null,
      radiusKm: Number.isFinite(rKm) ? rKm : null,
    }
  }, [peak?.estimatedCases, peak?.estimatedCasesRadiusKm])

  if (!open) return null

  const close = () => {
    setPhoenixHeatAlertsDialogOpen(false)
  }

  const dispatchMobileTeam = () => {
    createWorkOrder?.({
      type: 'Heat illness alert',
      title: 'Dispatch mobile emergency team',
      description: `Heat illness alert near (${peak?.lat?.toFixed?.(5)}, ${peak?.lng?.toFixed?.(5)})`,
      location: { lng: peak?.lng, lat: peak?.lat },
      city: 'phoenix',
      metadata: { peak },
    })
    close()
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 240,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)',
        pointerEvents: 'auto',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Heat illness alert actions"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        className="rounded-[12px] border shadow-xl overflow-hidden flex flex-col"
        style={{
          width: 560,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          background: 'rgba(23, 23, 23, 0.95)',
          backdropFilter: 'blur(12px) saturate(160%)',
          borderColor: 'rgba(255,255,255,0.10)',
          boxShadow: '0 18px 40px rgba(0,0,0,0.55), 0 10px 18px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-4 py-3 flex items-start justify-between gap-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Heat illness alert · {header.kindLabel}
            </div>
            <div className="text-[14px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.92)' }}>
              Top hotspot #{peak?.rank || '—'} · {header.dateLabel}
            </div>
            <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.62)' }}>
              Est. cases{estimates.radiusKm ? ` (${fmtMilesFromKm(estimates.radiusKm)} mi)` : ''}: {estimates.estCases == null ? '—' : Math.round(estimates.estCases).toLocaleString()}
            </div>
          </div>
          <button
            className="px-2 py-1 rounded border text-[12px] font-semibold"
            style={{ borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.82)' }}
            onClick={close}
          >
            Close
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto" style={{ flex: '1 1 auto' }}>
          <div className="text-[12px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.86)' }}>
            Recommended cooling centers
          </div>

          {status.state === 'loading' && (
            <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.60)' }}>Loading cooling centers…</div>
          )}
          {status.state === 'error' && (
            <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.60)' }}>{status.message}</div>
          )}

          {status.state === 'ready' && (
            <div className="space-y-2">
              {centers.map((c) => {
                const load = c.loadRatio
                const loadLabel = load == null ? '—' : `${Math.round(load * 100)}%`
                const loadTone = load != null && load >= 1 ? 'rgba(239, 68, 68, 0.90)' : load != null && load >= 0.8 ? 'rgba(245, 158, 11, 0.90)' : 'rgba(34, 197, 94, 0.90)'

                return (
                  <div
                    key={c.id}
                    className="rounded-[10px] border px-3 py-2"
                    style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.03)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.92)' }}>
                          {c.name}
                        </div>
                        <div className="text-[12px] truncate" style={{ color: 'rgba(255,255,255,0.60)' }}>
                          {c.address || '—'}
                        </div>
                        <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.60)' }}>
                          {fmtMiFromKm(c.distanceKm)} · District {c.councilDistrict || '—'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.70)' }}>
                          Capacity
                        </div>
                        <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.88)' }}>
                          {c.capacityEstimate?.toLocaleString?.() ?? '—'}
                        </div>
                        <div className="text-[12px]" style={{ color: loadTone }}>
                          Load: {loadLabel}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {(() => {
                        const isRedirected = !!phoenixHeatAlertsRedirectTarget && String(phoenixHeatAlertsRedirectTarget.id || '') === String(c.id || '')
                        if (isRedirected) {
                          return (
                            <button
                              className="px-3 py-1.5 rounded border text-[12px] font-semibold"
                              style={{ borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.86)' }}
                              onClick={() => {
                                setPhoenixHeatAlertsRedirectTarget?.(null)
                              }}
                            >
                              Cancel Redirect
                            </button>
                          )
                        }
                        return (
                          <button
                            className="px-3 py-1.5 rounded border text-[12px] font-semibold"
                            style={{ borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.86)' }}
                            onClick={() => {
                              setPhoenixHeatAlertsRedirectTarget?.({
                                id: String(c.id || `${c.lng},${c.lat}`),
                                lng: c.lng,
                                lat: c.lat,
                                name: c.name,
                                loadRatio: c.loadRatio,
                              })
                              requestMapFocus?.({ lng: c.lng, lat: c.lat, zoom: 15 })
                              createWorkOrder?.({
                                type: 'Heat illness alert',
                                title: `Redirect to cooling center: ${c.name}`,
                                description: `Redirect from hotspot to cooling center (${fmtMiFromKm(c.distanceKm)} away).`,
                                location: { lng: c.lng, lat: c.lat },
                                city: 'phoenix',
                                metadata: { peak, coolingCenter: c },
                              })
                              close()
                            }}
                          >
                            Redirect here
                          </button>
                        )
                      })()}

                      <button
                        className="px-3 py-1.5 rounded border text-[12px] font-semibold"
                        style={{ borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.86)' }}
                        onClick={dispatchMobileTeam}
                      >
                        Dispatch mobile team
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


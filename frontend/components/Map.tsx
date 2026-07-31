'use client'

import { Fragment, useEffect, useState, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { Station, RoutePlanRoute } from '../lib/types'
import { API_URL } from '../lib/api'
import { useStationData, useVehicleData, useShapeData, useRouteData } from '../lib/hooks'
import { VehicleMarker, UserLocation } from './VehicleMarkers'
import { ShapeLines } from './ShapeLines'
import { StationMarkers } from './StationMarkers'
import { StationSearch } from './StationSearch'
import { StationPopup } from './StationPopup'
import { routeHex } from '../lib/colors'

// ---------------------------------------------------------------------------
// ponytail: KISS-001 — Map.tsx is the Leaflet orchestrator.
// PERF: Data fetching delegated to custom hooks (useStationData, etc.).
//       Components are React.memo'd so re-renders only affect changed items.
//       StationMarkers uses viewport culling (only visible stations rendered).
//       ShapeLines uses zoom-based point simplification.
//
// FEATURES: Bus vehicle toggle (localStorage) + enhanced route planner
//           with recent searches, walking estimates, better results layout.
// ---------------------------------------------------------------------------

const KL_CENTER: [number, number] = [3.1390, 101.6869]

// ─── localStorage helpers ────────────────────────────────────────────────

function loadShowBuses(): boolean {
  if (typeof window === 'undefined') return true
  const v = localStorage.getItem('kv_show_buses')
  return v === null ? true : v === 'true'
}

function saveShowBuses(v: boolean) {
  localStorage.setItem('kv_show_buses', String(v))
}

type RecentSearch = { fromId: string; fromName: string; toId: string; toName: string }

function loadRecentSearches(): RecentSearch[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('kv_recent_searches')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveRecentSearches(searches: RecentSearch[]) {
  localStorage.setItem('kv_recent_searches', JSON.stringify(searches))
}

function addRecentSearch(from: Station, to: Station) {
  const searches = loadRecentSearches()
  const entry: RecentSearch = { fromId: from.stop_id, fromName: from.stop_name, toId: to.stop_id, toName: to.stop_name }
  const filtered = searches.filter(s => !(s.fromId === entry.fromId && s.toId === entry.toId))
  filtered.unshift(entry)
  saveRecentSearches(filtered.slice(0, 5))
}

// ─── walking estimate utils ──────────────────────────────────────────────

function walkEstimate(minutes: number): string {
  if (minutes < 1) return '<1 min walk'
  if (minutes === 1) return '1 min walk'
  return `${minutes} min walk`
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

// ─── FlyTo helper ─────────────────────────────────────────────────────────

function FlyTo({ pos }: { pos: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (pos) map.flyTo(pos, 15, { duration: 1 })
  }, [map, pos])
  return null
}

// ─── Bus toggle button ────────────────────────────────────────────────────

function BusToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={on ? 'Hide buses' : 'Show buses'}
      aria-pressed={on}
      style={{
        position: 'absolute', bottom: 68, left: 12, zIndex: 1100,
        height: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)',
        padding: '0 var(--space-4)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        borderRadius: 999, cursor: 'pointer',
        fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', fontWeight: 600,
        letterSpacing: '.02em', whiteSpace: 'nowrap',
        border: `1.5px solid ${on ? 'var(--kv-accent)' : 'var(--kv-border)'}`,
        background: on ? 'var(--kv-accent)' : 'var(--kv-surface)',
        color: on ? '#ffffff' : 'var(--kv-muted)',
        boxShadow: on ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'background .2s, color .2s, border-color .2s, box-shadow .2s',
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 -960 960 960"
        fill={on ? '#ffffff' : 'var(--kv-muted)'} style={{ flexShrink: 0, transition: 'fill .2s' }}>
        <path d="M240-120q-17 0-28.5-11.5T200-160v-82q-18-20-29-44.5T160-340v-380q0-83 69.5-111.5T480-860q166 0 243 26.5T800-720v380q0 29-11 53.5T760-242v82q0 17-11.5 28.5T720-120h-40q-17 0-28.5-11.5T640-160v-40H320v40q0 17-11.5 28.5T280-120h-40Zm0-360h480v-160H240v160Zm100 200q17 0 28.5-11.5T380-320q0-17-11.5-28.5T340-360q-17 0-28.5 11.5T300-320q0 17 11.5 28.5T340-280Zm280 0q17 0 28.5-11.5T660-320q0-17-11.5-28.5T620-360q-17 0-28.5 11.5T580-320q0 17 11.5 28.5T620-280ZM240-240h480v-120H240v120Zm0 0v-120 120Z"/>
      </svg>
      Buses
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────

export function TransitMap() {
  const vehicles = useVehicleData()
  const shapes = useShapeData()
  const routes = useRouteData()
  const stations = useStationData()

  // ─── Bus toggle ───────────────────────────────────────────────────────
  const [showBuses, setShowBuses] = useState(loadShowBuses)

  const toggleBuses = useCallback(() => {
    setShowBuses(prev => {
      const next = !prev
      saveShowBuses(next)
      return next
    })
  }, [])

  // Route ids of all RAIL routes (route_type 0/1/2, i.e. NOT 3). When the bus
  // toggle is OFF we keep only vehicles on KNOWN rail routes. Allow-list
  // semantics are required: vehicles whose route_id is missing from the GTFS
  // routes table (e.g. T-series feeder buses) are buses too and must hide —
  // the old `routeTypeMap.get(id) !== 3` filter leaked them because
  // `undefined !== 3` is true.
  const railRouteIds = useMemo(
    () => new Set(routes.filter(r => r.route_type !== 3).map(r => r.route_id)),
    [routes]
  )

  // Route ids of all BUS routes (route_type 3) — used to hide bus-stop dots
  const busRouteIds = useMemo(
    () => new Set(routes.filter(r => r.route_type === 3).map(r => r.route_id)),
    [routes]
  )

  const visibleVehicles = useMemo(() => {
    if (showBuses) return vehicles
    return vehicles.filter(v => railRouteIds.has(v.route_id))
  }, [vehicles, showBuses, railRouteIds])

  // ─── Local UI state ───────────────────────────────────────────────────
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)
  const [showRoutePlanner, setShowRoutePlanner] = useState(false)
  const [highlightRoute, setHighlightRoute] = useState<string | undefined>()
  const [flyPos, setFlyPos] = useState<[number, number] | null>(null)
  const [routeFrom, setRouteFrom] = useState<Station | null>(null)
  const [routeTo, setRouteTo] = useState<Station | null>(null)
  const [routeResults, setRouteResults] = useState<RoutePlanRoute[] | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [routeExpandedIdx, setRouteExpandedIdx] = useState<number | null>(null)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(loadRecentSearches)

  // ─── Route planning effect ────────────────────────────────────────────
  useEffect(() => {
    if (!routeFrom || !routeTo || routeFrom.stop_id === routeTo.stop_id) {
      setRouteResults(null); setRouteError(''); return
    }
    setRouteLoading(true); setRouteError(''); setRouteResults(null)
    fetch(`${API_URL}/api/route-plan?from=${routeFrom.stop_id}&to=${routeTo.stop_id}`)
      .then(r => { if (!r.ok) throw Error(); return r.json() })
      .then(data => {
        if (data.routes.length === 0) {
          setRouteError('No routes found between these stations')
          setRouteResults([])
        } else {
          setRouteResults(data.routes)
          setHighlightRoute(data.routes[0].legs[0]?.route_id)
          addRecentSearch(routeFrom!, routeTo!)
          setRecentSearches(loadRecentSearches())
        }
        const mid = { lat: (routeFrom!.stop_lat + routeTo!.stop_lat) / 2, lon: (routeFrom!.stop_lon + routeTo!.stop_lon) / 2 }
        setFlyPos([mid.lat, mid.lon])
      })
      .catch(() => {
        setRouteError('Unable to find a route between these stations')
        setRouteResults([])
      })
      .finally(() => setRouteLoading(false))
  }, [routeFrom, routeTo])

  const swapRoute = () => {
    const f = routeFrom, t = routeTo
    setRouteFrom(t); setRouteTo(f)
  }

  const handleStationClick = useCallback((s: Station) => {
    setSelectedStation(s)
    setShowRoutePlanner(false)
    setFlyPos([s.stop_lat, s.stop_lon])
  }, [])

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <BusToggle on={showBuses} onToggle={toggleBuses} />

      {!selectedStation && <div style={{
        position: 'absolute', top: 12, right: 12,
        zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
        width: 320, maxWidth: 'calc(100vw - 60px)',
        maxHeight: 'calc(100vh - 60px)', overflowY: 'auto',
      }}>
        <div style={{
          display: 'flex', gap: 2, padding: 3, background: 'var(--kv-bg)', borderRadius: 'var(--radius-md)',
          position: 'sticky', top: 0, zIndex: 10000,
        }}>
          {[
            { label: 'Stations', active: !showRoutePlanner, onClick: () => { setShowRoutePlanner(false); setHighlightRoute(undefined) } },
            { label: 'Routes', active: showRoutePlanner, onClick: () => { setShowRoutePlanner(true); setSelectedStation(null) } },
          ].map(b => (
            <button key={b.label} onClick={b.onClick} style={{
              padding: 'var(--space-1) var(--space-4)', border: 'none', cursor: 'pointer',
              fontSize: 'var(--text-sm)', display: 'flex',
              fontWeight: 600, fontFamily: 'var(--font-ui)',
              borderRadius: 7, letterSpacing: '.02em', alignItems: 'center',
              background: b.active ? 'var(--kv-surface)' : 'transparent',
              color: b.active ? 'var(--kv-ink)' : 'var(--kv-muted)',
              boxShadow: b.active ? 'var(--shadow-sm)' : 'none',
              transition: 'all .15s',
            }}>
              <span style={{ marginRight: 5, height: 24 }}>
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill={b.active ? '#1a1a1a' : '#888'}><path d={b.label === 'Stations' ? "M80-80v-526q0-85 44-147.5T248-848q54-21 115-26.5t117-5.5q56 0 117 5.5T712-848q80 32 124 94.5T880-606v526H80Zm284-80h230l-60-60H424l-60 60Zm-64-280h360v-160H300v160Zm348.5 128.5Q660-323 660-340t-11.5-28.5Q637-380 620-380t-28.5 11.5Q580-357 580-340t11.5 28.5Q603-300 620-300t28.5-11.5Zm-280 0Q380-323 380-340t-11.5-28.5Q357-380 340-380t-28.5 11.5Q300-357 300-340t11.5 28.5Q323-300 340-300t28.5-11.5ZM160-160h140v-20l42-42q-44-6-73-39.5T240-340v-260q0-78 74.5-99T480-720q100 0 170 21t70 99v260q0 45-29 78.5T618-222l42 42v20h140v-446q0-60-29.5-102.5T682-774q-44-17-97.5-21.5T480-800q-51 0-104.5 4.5T278-774q-59 23-88.5 65.5T160-606v446Zm0 0h640-640Z" : "M247-167q-47-47-47-113v-327q-35-13-57.5-43.5T120-720q0-50 35-85t85-35q50 0 85 35t35 85q0 39-22.5 69.5T280-607v327q0 33 23.5 56.5T360-200q33 0 56.5-23.5T440-280v-400q0-66 47-113t113-47q66 0 113 47t47 113v327q35 13 57.5 43.5T840-240q0 50-35 85t-85 35q-50 0-85-35t-35-85q0-39 22.5-70t57.5-43v-327q0-33-23.5-56.5T600-760q-33 0-56.5 23.5T520-680v400q0 66-47 113t-113 47q-66 0-113-47Zm-7-513q17 0 28.5-11.5T280-720q0-17-11.5-28.5T240-760q-17 0-28.5 11.5T200-720q0 17 11.5 28.5T240-680Zm480 480q17 0 28.5-11.5T760-240q0-17-11.5-28.5T720-280q-17 0-28.5 11.5T680-240q0 17 11.5 28.5T720-200ZM240-720Zm480 480Z"} /></svg>
              </span> {b.label}
            </button>
          ))}
        </div>

        {!showRoutePlanner ? (
          <StationSearch
            stations={stations}
            onSelect={handleStationClick}
            placeholder="Search stations..."
          />
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--kv-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--kv-success)', fontSize: 'var(--text-base)', fontWeight: 700 }}>A</div>
                {routeFrom ? (
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', background: 'var(--kv-surface)', opacity: 0.85, borderRadius: 'var(--radius-md)', padding: '0 var(--space-3)', boxShadow: 'var(--shadow-sm)', border: '1.5px solid var(--kv-border)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--kv-success)" stroke="none" style={{ flexShrink: 0 }}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      <span style={{ flex: 1, fontSize: 'var(--text-base)', padding: 'var(--space-3) 0', color: 'var(--kv-ink)', fontFamily: 'var(--font-ui)' }}>{routeFrom.stop_name}</span>
                      <button onClick={() => { setRouteFrom(null); setRouteResults(null); setRouteError(''); setRouteExpandedIdx(null) }} style={{ background: 'var(--kv-border)', border: 'none', borderRadius: '50%', cursor: 'pointer', minWidth: 'var(--touch-target-min)', minHeight: 'var(--touch-target-min)', width: 'var(--touch-target-min)', height: 'var(--touch-target-min)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0, color: 'var(--kv-muted)', fontSize: 'var(--text-sm)', lineHeight: 1 }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <StationSearch stations={stations} onSelect={setRouteFrom} placeholder="From..." />
                )}
                <button onClick={swapRoute} style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--kv-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0, fontSize: 'var(--text-base)', color: 'var(--kv-muted)' }}>⇄</button>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--kv-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--kv-danger)', fontSize: 'var(--text-base)', fontWeight: 700 }}>B</div>
                {routeTo ? (
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', background: 'var(--kv-surface)', opacity: 0.85, borderRadius: 'var(--radius-md)', padding: '0 var(--space-3)', boxShadow: 'var(--shadow-sm)', border: '1.5px solid var(--kv-border)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--kv-danger)" stroke="none" style={{ flexShrink: 0 }}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      <span style={{ flex: 1, fontSize: 'var(--text-base)', padding: 'var(--space-3) 0', color: 'var(--kv-ink)', fontFamily: 'var(--font-ui)' }}>{routeTo.stop_name}</span>
                      <button onClick={() => { setRouteTo(null); setRouteResults(null); setRouteError(''); setRouteExpandedIdx(null) }} style={{ background: 'var(--kv-border)', border: 'none', borderRadius: '50%', cursor: 'pointer', minWidth: 'var(--touch-target-min)', minHeight: 'var(--touch-target-min)', width: 'var(--touch-target-min)', height: 'var(--touch-target-min)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0, color: 'var(--kv-muted)', fontSize: 'var(--text-sm)', lineHeight: 1 }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <StationSearch stations={stations} onSelect={setRouteTo} placeholder="To..." />
                )}
              </div>
            </div>

            {/* Recent searches quick-select chips */}
            {recentSearches.length > 0 && !routeFrom && !routeTo && (
              <div style={{ marginTop: 'var(--space-1)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--kv-muted)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Recent</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {recentSearches.map((rs, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const f = stations.find(s => s.stop_id === rs.fromId)
                        const t = stations.find(s => s.stop_id === rs.toId)
                        if (f && t) { setRouteFrom(f); setRouteTo(t) }
                      }}
                      style={{
                        padding: 'var(--space-1) var(--space-2)',
                        border: '1px solid var(--kv-border)',
                        borderRadius: 6, cursor: 'pointer',
                        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)',
                        background: 'var(--kv-bg)', color: 'var(--kv-ink)',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--kv-surface)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--kv-bg)')}
                    >
                      {rs.fromName} → {rs.toName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading state with spinner */}
            {routeLoading && (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--kv-muted)', textAlign: 'center', padding: 'var(--space-5) 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
                <span style={{ width: 16, height: 16, border: '2px solid var(--kv-border)', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'kv-spin 0.6s linear infinite', display: 'inline-block' }} />
                Searching routes...
              </div>
            )}

            {/* Empty/error state */}
            {routeError && !routeLoading && (
              <div style={{
                color: 'var(--kv-muted)', fontSize: 'var(--text-sm)',
                padding: 'var(--space-4) var(--space-3)',
                background: 'var(--kv-bg)', borderRadius: 8,
                textAlign: 'center', border: '1px solid var(--kv-border)',
              }}>
                <div style={{ fontSize: 32, marginBottom: 'var(--space-1)' }}>🚏</div>
                <div style={{ fontWeight: 600, color: 'var(--kv-ink)', marginBottom: 2 }}>No Routes Found</div>
                <div>{routeError}</div>
              </div>
            )}

            {/* Route results with enhanced layout */}
            {routeResults && routeResults.length > 0 && (
              <div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--kv-muted)', marginBottom: 'var(--space-2)', fontWeight: 500 }}>
                  {routeResults.length} route{routeResults.length > 1 ? 's' : ''} found
                  {routeResults[0]?.legs[0]?.duration_sec ? (
                    <span style={{ marginLeft: 'var(--space-2)', fontWeight: 400 }}>
                      · ~{fmtDuration(routeResults.reduce((sum, r) => sum + r.legs.reduce((s, l) => s + (l.duration_sec || 0), 0), 0) / Math.max(1, routeResults.length))}
                    </span>
                  ) : null}
                </div>
                {routeResults.map((r, i) => {
                  const expanded = routeExpandedIdx === i
                  const leg0Color = routeHex(r.legs[0]?.route_color, '#ccc')
                  const totalStops = r.legs.reduce((s, l) => s + (l.stops?.length || 0), 0)
                  const totalWalkKm = (r.transfers || []).reduce((s, t) => s + (t.distance_m || 0), 0) / 1000

                  return (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <button
                      onClick={() => setRouteExpandedIdx(expanded ? null : i)}
                      style={{
                        width: '100%', padding: 'var(--space-3)', borderRadius: 8, border: 'none',
                        textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-ui)',
                        background: 'var(--kv-surface)',
                        borderLeft: `3px solid ${leg0Color}`,
                        transition: 'background .1s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                        {/* Colored dot(s) for each leg */}
                        <div style={{ display: 'flex', gap: 2, marginTop: 4, flexShrink: 0 }}>
                          {r.legs.map((leg, li) => {
                            const c = routeHex(leg.route_color, '#ccc')
                            return (
                              <Fragment key={li}>
                                {li > 0 && <div style={{ width: 6, height: 2, background: 'var(--kv-border)', marginTop: 4, borderRadius: 1 }} />}
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, border: `2px solid ${c}44` }} />
                              </Fragment>
                            )
                          })}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--kv-ink)', lineHeight: 1.4 }}>
                            {r.legs.map(l => l.route_name).join('  →  ')}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--kv-muted)', marginTop: 3, lineHeight: 1.3 }}>
                            {r.legs[0].from_stop.stop_name} → {r.legs[r.legs.length - 1].to_stop.stop_name}
                            {totalStops > 0 && <span> · {totalStops} stop{totalStops !== 1 ? 's' : ''}</span>}
                            {r.legs.length > 1 && r.transfers && r.transfers.length > 0 && (
                              <span> · transfer{r.transfers.length > 1 ? 's' : ''} at {r.transfers.map(t => t.from_stop.stop_name).join(' & ')}</span>
                            )}
                            {totalWalkKm > 0.05 && (
                              <span> · {walkEstimate(Math.ceil(totalWalkKm * 12))}</span>
                            )}
                          </div>
                          {/* Journey summary line */}
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--kv-muted)', marginTop: 3, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                            {r.legs.map((leg, li) => (
                              <Fragment key={li}>
                                {li > 0 && <span>→</span>}
                                <span style={{ color: routeHex(leg.route_color, '#999'), fontWeight: 600 }}>{leg.route_name}</span>
                                <span>→</span>
                                <span style={{ fontWeight: 500 }}>{leg.to_stop.stop_name}</span>
                              </Fragment>
                            ))}
                          </div>
                        </div>
                        <span style={{ color: 'var(--kv-muted)', fontSize: 'var(--text-xs)', transition: 'transform .15s', transform: expanded ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>▼</span>
                      </div>
                    </button>

                    {/* Expanded leg details with timeline */}
                    {expanded && (
                      <div style={{ marginTop: 4, padding: 'var(--space-3)', background: 'var(--kv-bg)', borderRadius: 8, border: '1px solid var(--kv-border)' }}>
                        {r.legs.map((leg, li) => {
                          const legColor = routeHex(leg.route_color)
                          const tr = li > 0 ? r.transfers?.[li - 1] : undefined
                          const walkKm = tr ? (tr.distance_m || 0) / 1000 : 0
                          return (
                          <div key={li}>
                            {li > 0 && (
                              <div style={{
                                margin: 'var(--space-2) 0', padding: 'var(--space-2) var(--space-3)',
                                background: 'var(--kv-surface)', borderRadius: 6,
                                border: '1px dashed var(--kv-border)',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
                                  <span style={{ color: 'var(--kv-accent)', fontWeight: 600 }}>🔄 Transfer</span>
                                  {tr && <span style={{ color: 'var(--kv-ink)', fontWeight: 500 }}>at {tr.from_stop.stop_name}</span>}
                                  {walkKm > 0.05 && (
                                    <span style={{ color: 'var(--kv-muted)', fontSize: 'var(--text-xs)' }}>
                                      · {walkEstimate(Math.ceil(walkKm * 12))}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            <div>
                              <div style={{
                                fontSize: 'var(--text-xs)', fontWeight: 700, color: legColor,
                                marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                              }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: legColor, display: 'inline-block', flexShrink: 0 }} />
                                <span>{leg.route_name}</span>
                                <span style={{ fontWeight: 400, color: 'var(--kv-muted)' }}>
                                  · {leg.stops?.length || 0} stop{(leg.stops?.length || 0) !== 1 ? 's' : ''}
                                  {leg.duration_sec ? ` · ~${fmtDuration(leg.duration_sec)}` : ''}
                                </span>
                              </div>
                              {/* Timeline stop list */}
                              <div style={{ position: 'relative', paddingLeft: 'var(--space-1)' }}>
                                {(leg.stops || []).map((name, si) => {
                                  const isFirst = si === 0
                                  const isLast = si === (leg.stops?.length || 0) - 1
                                  const isTransferPoint = li < r.legs.length - 1 && isLast
                                  return (
                                  <div key={si} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', padding: 'var(--space-1) 0', position: 'relative', minHeight: 28 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 12 }}>
                                      <div style={{
                                        width: 12, height: 12, borderRadius: '50%',
                                        background: isFirst || isLast ? legColor : 'var(--kv-surface)',
                                        border: `2px solid ${legColor}`,
                                        zIndex: 1,
                                      }} />
                                      {!isLast && (
                                        <div style={{ width: 2, flex: 1, background: `${legColor}44`, minHeight: 8 }} />
                                      )}
                                    </div>
                                    <div style={{
                                      fontSize: 'var(--text-sm)', color: 'var(--kv-ink)',
                                      fontWeight: isFirst || isLast ? 600 : 400,
                                      lineHeight: 1.3,
                                    }}>
                                      {name}
                                      {isFirst && (
                                        <span style={{ color: 'var(--kv-muted)', fontWeight: 400, marginLeft: 4, fontSize: 'var(--text-xs)' }}>
                                          · {leg.from_stop.stop_name === name ? 'start' : 'board'}
                                        </span>
                                      )}
                                      {isLast && (
                                        <span style={{
                                          color: isTransferPoint ? 'var(--kv-accent)' : 'var(--kv-success)',
                                          fontWeight: 600, marginLeft: 4, fontSize: 'var(--text-xs)',
                                        }}>
                                          · {isTransferPoint ? 'transfer' : 'arrive'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )})}
                              </div>
                            </div>
                          </div>
                        )})}
                      </div>
                    )}
                  </div>
                )})}
              </div>
            )}
          </>
        )}
      </div>}

      <MapContainer attributionControl={false} center={KL_CENTER} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <ShapeLines shapes={shapes} routes={routes} highlight={highlightRoute} />
        <StationMarkers stations={stations} busRouteIds={busRouteIds} onSelect={handleStationClick} />
        {visibleVehicles.map(v => <VehicleMarker key={v.vehicle_id} v={v} />)}
        <UserLocation />
        <FlyTo pos={flyPos} />
      </MapContainer>
      {selectedStation && <StationPopup station={selectedStation} onClose={() => setSelectedStation(null)} />}
    </div>
  )
}

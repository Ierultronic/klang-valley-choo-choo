'use client'

import { useEffect, useState, useCallback } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { Station, RoutePlanRoute } from '../lib/types'
import { API_URL } from '../lib/api'
import { useStationData, useVehicleData, useShapeData, useRouteData } from '../lib/hooks'
import { VehicleMarker, UserLocation } from './VehicleMarkers'
import { ShapeLines } from './ShapeLines'
import { StationMarkers } from './StationMarkers'
import { StationSearch } from './StationSearch'
import { StationPopup } from './StationPopup'

// ---------------------------------------------------------------------------
// ponytail: KISS-001 — Map.tsx is the Leaflet orchestrator.
// PERF: Data fetching delegated to custom hooks (useStationData, etc.).
//       Components are React.memo'd so re-renders only affect changed items.
//       StationMarkers uses viewport culling (only visible stations rendered).
//       ShapeLines uses zoom-based point simplification.
// ---------------------------------------------------------------------------

const KL_CENTER: [number, number] = [3.1390, 101.6869]

function FlyTo({ pos }: { pos: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (pos) map.flyTo(pos, 15, { duration: 1 })
  }, [map, pos])
  return null
}

export function TransitMap() {
  // Data from custom hooks — each manages its own lifecycle
  const vehicles = useVehicleData()
  const shapes = useShapeData()
  const routes = useRouteData()
  const stations = useStationData()

  // Local UI state (not fetched)
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

  useEffect(() => {
    if (!routeFrom || !routeTo || routeFrom.stop_id === routeTo.stop_id) {
      setRouteResults(null); setRouteError(''); return
    }
    setRouteLoading(true); setRouteError(''); setRouteResults(null)
    fetch(`${API_URL}/api/route-plan?from=${routeFrom.stop_id}&to=${routeTo.stop_id}`)
      .then(r => { if (!r.ok) throw Error(); return r.json() })
      .then(data => {
        if (data.routes.length === 0) throw Error()
        setRouteResults(data.routes)
        setHighlightRoute(data.routes[0].legs[0]?.route_id)
        const mid = { lat: (routeFrom.stop_lat + routeTo.stop_lat) / 2, lon: (routeFrom.stop_lon + routeTo.stop_lon) / 2 }
        setFlyPos([mid.lat, mid.lon])
      })
      .catch(() => setRouteError('No route found'))
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
      {!selectedStation && <div style={{
        position: 'absolute', top: 12, right: 12,
        zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8,
        width: 320, maxWidth: 'calc(100vw - 40px)',
        maxHeight: 'calc(100vh - 60px)', overflowY: 'auto',
      }}>
        <div style={{
          display: 'flex', gap: 2, padding: 3, background: '#f1f3f5cb', borderRadius: 10,
          position: 'sticky', top: 0, zIndex: 10000, backdropFilter: 'blur(10px)',
        }}>
          {[
            { label: 'Stations', active: !showRoutePlanner, onClick: () => { setShowRoutePlanner(false); setHighlightRoute(undefined) } },
            { label: 'Routes', active: showRoutePlanner, onClick: () => { setShowRoutePlanner(true); setSelectedStation(null) } },
          ].map(b => (
            <button key={b.label} onClick={b.onClick} style={{
              padding: '5px 16px', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex',
              fontWeight: 600, fontFamily: 'system-ui, sans-serif',
              borderRadius: 7, letterSpacing: '.02em', alignItems: 'center',
              background: b.active ? 'white' : 'transparent',
              color: b.active ? '#1a1a1a' : '#888',
              boxShadow: b.active ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#e8f4e8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#16a34a', fontSize: 14, fontWeight: 700 }}>A</div>
                {routeFrom ? (
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255, 255, 255, 0.7)', borderRadius: 10, padding: '0 12px', boxShadow: '0 2px 8px rgba(0,0,0,.08)', border: '1.5px solid #d1d5dbb3' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#16a34a" stroke="none" style={{ flexShrink: 0 }}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      <span style={{ flex: 1, fontSize: 14, padding: '10px 0', color: '#1a1a1a', fontFamily: 'system-ui, sans-serif' }}>{routeFrom.stop_name}</span>
                      <button onClick={() => { setRouteFrom(null); setRouteResults(null); setRouteError(''); setRouteExpandedIdx(null) }} style={{ background: '#e5e7eb', border: 'none', borderRadius: '50%', cursor: 'pointer', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0, color: '#666', fontSize: 12, lineHeight: 1 }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <StationSearch stations={stations} onSelect={setRouteFrom} placeholder="From..." />
                )}
                <button onClick={swapRoute} style={{ width: 28, height: 28, borderRadius: 8, background: '#f1f3f5', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0, fontSize: 14, color: '#666' }}>⇄</button>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#dc2626', fontSize: 14, fontWeight: 700 }}>B</div>
                {routeTo ? (
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255, 255, 255, 0.7)', borderRadius: 10, padding: '0 12px', boxShadow: '0 2px 8px rgba(0,0,0,.08)', border: '1.5px solid #d1d5db' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#dc2626" stroke="none" style={{ flexShrink: 0 }}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      <span style={{ flex: 1, fontSize: 14, padding: '10px 0', color: '#1a1a1a', fontFamily: 'system-ui, sans-serif' }}>{routeTo.stop_name}</span>
                      <button onClick={() => { setRouteTo(null); setRouteResults(null); setRouteError(''); setRouteExpandedIdx(null) }} style={{ background: '#e5e7eb', border: 'none', borderRadius: '50%', cursor: 'pointer', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0, color: '#666', fontSize: 12, lineHeight: 1 }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <StationSearch stations={stations} onSelect={setRouteTo} placeholder="To..." />
                )}
              </div>
            </div>

            {routeLoading && <div style={{ fontSize: 13, color: '#888', textAlign: 'center', padding: '8px 0' }}>Searching routes...</div>}
            {routeError && <div style={{ color: '#dc2626', fontSize: 13, padding: '8px 12px', background: '#fef2f2', borderRadius: 8 }}>{routeError}</div>}

            {routeResults && routeResults.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 8, fontWeight: 500 }}>
                  {routeResults.length} route{routeResults.length > 1 ? 's' : ''} found
                </div>
                {routeResults.map((r, i) => {
                  const expanded = routeExpandedIdx === i
                  const color = r.legs[0]?.route_color || 'ccc'
                  const totalStops = r.legs.reduce((s, l) => s + (l.stops?.length || 0), 0)
                  return (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <button
                      onClick={() => setRouteExpandedIdx(expanded ? null : i)}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none',
                        textAlign: 'left', cursor: 'pointer', fontFamily: 'system-ui, sans-serif',
                        background: '#ffffff', borderLeft: `3px solid #${color}`,
                        display: 'flex', alignItems: 'center', gap: 8,
                        transition: 'background .1s',
                      }}
                    >
                      <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: `#${color}`, border: `2px solid #${color}44` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a1a' }}>
                          {r.legs.length === 1 ? r.legs[0].route_name : `${r.legs[0].route_name} → ${r.legs[1].route_name}`}
                        </div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          {r.legs[0].from_stop.stop_name} → {r.legs[r.legs.length-1].to_stop.stop_name}
                          {totalStops > 0 && ` · ${totalStops} stop${totalStops !== 1 ? 's' : ''}`}
                        </div>
                      </div>
                      <span style={{ color: '#999', fontSize: 11, transition: 'transform .15s', transform: expanded ? 'rotate(180deg)' : 'none' }}>▼</span>
                    </button>
                    {expanded && (
                      <div style={{ marginTop: 4, padding: '6px 12px 10px 12px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                        {r.legs.map((leg, li) => (
                          <div key={li}>
                            {li > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
                                <span style={{ flex: 1, height: 1, background: '#dbeafe' }} />
                                Transfer at {r.transfer_at?.stop_name}
                                <span style={{ flex: 1, height: 1, background: '#dbeafe' }} />
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: 11, color: '#888', marginBottom: 4, fontWeight: 600 }}>
                                <span style={{ color: `#${leg.route_color}` }}>●</span> {leg.route_name}
                                <span style={{ fontWeight: 400, color: '#aaa' }}> · {leg.stops?.length} stops</span>
                              </div>
                              <div style={{ position: 'relative' }}>
                                {(leg.stops || []).map((name, si) => (
                                  <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', position: 'relative' }}>
                                    <div style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, zIndex: 1, background: si === 0 || si === (leg.stops?.length || 0) - 1 ? `#${leg.route_color}` : 'white', border: `2px solid #${leg.route_color}` }} />
                                    <div style={{ fontSize: 12, color: '#1a1a1a', fontWeight: si === 0 || si === (leg.stops?.length || 0) - 1 ? 600 : 400 }}>
                                      {name}
                                      {si === 0 && <span style={{ color: '#888', fontWeight: 400, marginLeft: 4, fontSize: 10 }}>(start)</span>}
                                      {si === (leg.stops?.length || 0) - 1 && <span style={{ color: li < r.legs.length - 1 ? '#2563eb' : '#16a34a', fontWeight: 400, marginLeft: 4, fontSize: 10 }}>({li < r.legs.length - 1 ? 'transfer' : 'end'})</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
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
        <StationMarkers stations={stations} onSelect={handleStationClick} />
        {vehicles.map(v => <VehicleMarker key={v.vehicle_id} v={v} />)}
        <UserLocation />
        <FlyTo pos={flyPos} />
      </MapContainer>
      {selectedStation && <StationPopup station={selectedStation} onClose={() => setSelectedStation(null)} />}
    </div>
  )
}

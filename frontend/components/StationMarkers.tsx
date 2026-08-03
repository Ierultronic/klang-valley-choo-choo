'use client'

import { memo, useMemo, useState, useEffect } from 'react'
import { CircleMarker, useMap } from 'react-leaflet'
import { LatLngBounds } from 'leaflet'
import { Station } from '../lib/types'

// ---------------------------------------------------------------------------
// ponytail: KISS-001 — station circle markers layer.
// PERF: React.memo + viewport culling — only render stations in visible bounds.
//       Big win: 1000+ DOM nodes → ~50 at typical zoom.
// ---------------------------------------------------------------------------

export const StationMarkers = memo(function StationMarkers({
  stations,
  busRouteIds,
  hiddenRouteIds,
  onSelect,
}: {
  stations: Station[]
  busRouteIds: Set<string>
  // Lines hidden in the menu: drop stations served ONLY by hidden lines
  // (interchanges with at least one visible line stay).
  hiddenRouteIds: Set<string>
  onSelect: (s: Station) => void
}) {
  const map = useMap()

  // Track viewport bounds so useMemo re-runs on pan/zoom
  const [bounds, setBounds] = useState<LatLngBounds>(map.getBounds())

  useEffect(() => {
    const update = () => setBounds(map.getBounds())
    map.on('moveend zoomend', update)
    return () => { map.off('moveend zoomend', update) }
  }, [map])

  // Filter stations to visible viewport only; hide pure bus stops
  // (all of their route_ids are bus routes, route_type 3) and stations
  // served ONLY by user-hidden lines. Stations with empty route_ids stay
  // visible — don't hide what we don't know.
  const visible = useMemo(() => {
    return stations.filter(s =>
      bounds.contains([s.stop_lat, s.stop_lon]) &&
      (s.route_ids.length === 0 || s.route_ids.some(id => !busRouteIds.has(id))) &&
      (s.route_ids.length === 0 || s.route_ids.some(id => !hiddenRouteIds.has(id)))
    )
  }, [stations, bounds, busRouteIds, hiddenRouteIds])

  return (
    <>
      {visible.map(s => (
        <CircleMarker
          key={s.stop_id}
          center={[s.stop_lat, s.stop_lon]}
          radius={6}
          pathOptions={{
            color: s.route_color ? `#${s.route_color}` : '#666',
            fillColor: s.route_color ? `#${s.route_color}` : '#666',
            fillOpacity: 0.8,
            weight: 2,
          }}
          eventHandlers={{ click: () => onSelect(s) }}
        />
      ))}
    </>
  )
})

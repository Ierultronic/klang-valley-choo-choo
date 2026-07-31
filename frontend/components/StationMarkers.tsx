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
  onSelect,
}: {
  stations: Station[]
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

  // Filter stations to visible viewport only
  const visible = useMemo(() => {
    return stations.filter(s => bounds.contains([s.stop_lat, s.stop_lon]))
  }, [stations, bounds])

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

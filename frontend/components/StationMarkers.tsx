'use client'

import { CircleMarker } from 'react-leaflet'
import { Station } from '../lib/types'

// ---------------------------------------------------------------------------
// ponytail: KISS-001 — station circle markers layer extracted from Map.tsx.
// ---------------------------------------------------------------------------

export function StationMarkers({ stations, onSelect }: {
  stations: Station[]
  onSelect: (s: Station) => void
}) {
  return (
    <>
      {stations.map(s => (
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
}

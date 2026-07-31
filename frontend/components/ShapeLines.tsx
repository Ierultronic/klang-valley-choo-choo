'use client'

import { Polyline } from 'react-leaflet'
import { Shape, Route } from '../lib/types'

// ---------------------------------------------------------------------------
// ponytail: KISS-001 — shape/route polyline layer extracted from Map.tsx.
// ---------------------------------------------------------------------------

export function ShapeLines({ shapes, routes, highlight }: {
  shapes: Shape[]
  routes: Route[]
  highlight?: string
}) {
  const routeMap = new Map(routes.map(r => [r.route_id, r]))
  return (
    <>
      {shapes.map(s => {
        const isHL = highlight && s.route_id === highlight
        const color = routeMap.get(s.route_id)?.route_color
          ? `#${routeMap.get(s.route_id)!.route_color}`
          : '#666'
        return (
          <Polyline
            key={s.shape_id}
            positions={s.points.map(p => [p.lat, p.lon])}
            pathOptions={{ color, weight: isHL ? 6 : 4, opacity: isHL ? 1 : 0.7 }}
          />
        )
      })}
    </>
  )
}

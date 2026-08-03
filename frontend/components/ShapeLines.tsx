'use client'

import { memo, useMemo, useState, useEffect } from 'react'
import { Polyline, useMap } from 'react-leaflet'
import { Shape, Route } from '../lib/types'
import { simplifyPoints, zoomToEpsilon } from '../lib/simplify'

// ---------------------------------------------------------------------------
// ponytail: KISS-001 — shape/route polyline layer.
// PERF: React.memo + routeMap memo + point simplification at current zoom.
//       Drops 60-90% of polyline vertices that are invisible at current zoom.
// ---------------------------------------------------------------------------

export const ShapeLines = memo(function ShapeLines({
  shapes,
  routes,
  highlight,
}: {
  shapes: Shape[]
  routes: Route[]
  // Single route_id (legend filter) or an array (multi-leg plan highlight).
  highlight?: string | string[]
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())

  useEffect(() => {
    const update = () => setZoom(map.getZoom())
    map.on('zoomend', update)
    return () => { map.off('zoomend', update) }
  }, [map])

  // Memoize the route_id → color lookup
  const routeMap = useMemo(
    () => new Map(routes.map(r => [r.route_id, r])),
    [routes]
  )

  // Bus routes (route_type 3) are NOT drawn as polylines — user only wants the
  // marker toggle for buses. Highlighted routes (route planner) still override.
  const busRouteIds = useMemo(
    () => new Set(routes.filter(r => r.route_type === 3).map(r => r.route_id)),
    [routes]
  )

  // One epsilon per render cycle, based on current zoom
  const epsilon = useMemo(() => zoomToEpsilon(zoom), [zoom])

  return (
    <>
      {shapes.map(s => {
        // Multi-leg plan highlight (string[]) or single-route legend filter.
        const isHL = Array.isArray(highlight)
          ? highlight.includes(s.route_id)
          : highlight === s.route_id
        // Skip bus route polylines entirely — unless this exact route is
        // highlighted by the route planner (highlight overrides the exclusion).
        if (!isHL && busRouteIds.has(s.route_id)) return null
        const color = routeMap.get(s.route_id)?.route_color
          ? `#${routeMap.get(s.route_id)!.route_color}`
          : '#666'

        // Simplify points: drop vertices that deviate less than epsilon
        const raw: [number, number][] = s.points.map(p => [p.lat, p.lon])
        const simplified = epsilon > 0 && raw.length > 2
          ? simplifyPoints(raw, epsilon)
          : raw

        return (
          <Polyline
            key={s.shape_id}
            positions={simplified}
            pathOptions={{
              color,
              weight: isHL ? 6 : 4,
              // Dim the whole network hard (0.18) while any highlight is
              // active so the planned route / legend line reads instantly.
              opacity: isHL ? 1 : highlight ? 0.18 : 0.7,
            }}
          />
        )
      })}
    </>
  )
})

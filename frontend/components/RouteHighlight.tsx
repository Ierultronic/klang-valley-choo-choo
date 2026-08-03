'use client'

import { Fragment, memo, useMemo } from 'react'
import { Polyline, CircleMarker } from 'react-leaflet'
import { Shape, RoutePlanRoute, RouteLeg, Station } from '../lib/types'
import { routeHex } from '../lib/colors'

// ───────────────────────────────────────────────────────────────────────────
// ponytail: KISS-001 — planned-route overlay (UI-UX-NEXT #2).
// Renders each leg of the ACTIVE plan card as a thick polyline (shape_id →
// useShapeData lookup, route_id fallback), plus dashed transfer-walk lines
// and tappable interchange dots. Dimming of every other shape is handled by
// ShapeLines via the shared highlight prop (string[]).
// PERF: memo'd; shape_id → shape map built once per shapes load.
// ───────────────────────────────────────────────────────────────────────────

// Leaflet SVG stroke/fill attributes can't resolve CSS var(); resolve the
// token once (fallback mirrors globals.css --kv-accent).
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}
const ACCENT = '#1d4ed8'

export const RouteHighlight = memo(function RouteHighlight({
  shapes,
  route,
  fullPath,
  onStationClick,
}: {
  shapes: Shape[]
  /** Active plan card driving the overlay. */
  route: RoutePlanRoute
  /** false → leg-1 highlight only (collapsed card); true → every leg. */
  fullPath: boolean
  /** Reuses the station-selection mechanism (opens popup + flies). */
  onStationClick: (s: Station) => void
}) {
  const shapeById = useMemo(
    () => new Map(shapes.map(s => [s.shape_id, s])),
    [shapes]
  )

  // Points for a leg: exact shape by shape_id; fallback = first shape of the
  // leg's route (whole-line highlight, Google Maps style) — safety net if
  // shape_id is ever missing.
  const legPoints = (leg: RouteLeg): [number, number][] | null => {
    const shape = shapeById.get(leg.shape_id) || shapes.find(s => s.route_id === leg.route_id)
    if (!shape || shape.points.length < 2) return null
    const pts: [number, number][] = shape.points.map(p => [p.lat, p.lon])
    return pts
  }

  const legs = fullPath ? route.legs : route.legs.slice(0, 1)
  const accent = cssVar('--kv-accent', ACCENT)

  return (
    <>
      {/* Leg polylines: weight 5, line color, near-full opacity */}
      {legs.map((leg, i) => {
        const pts = legPoints(leg)
        if (!pts) return null
        return (
          <Polyline
            key={`leg-${i}-${leg.shape_id || leg.route_id}`}
            positions={pts}
            pathOptions={{ color: routeHex(leg.route_color), weight: 5, opacity: 0.95 }}
          />
        )
      })}
      {/* Transfer walks: honest straight dashed line + interchange dot */}
      {(route.transfers || []).map((t, i) => (
        <Fragment key={`walk-${i}`}>
          <Polyline
            positions={[
              [t.from_stop.stop_lat, t.from_stop.stop_lon],
              [t.to_stop.stop_lat, t.to_stop.stop_lon],
            ]}
            pathOptions={{ color: accent, weight: 3, opacity: 0.95, dashArray: '6 8' }}
          />
          <CircleMarker
            center={[t.from_stop.stop_lat, t.from_stop.stop_lon]}
            radius={5}
            pathOptions={{ color: accent, weight: 2, fillColor: accent, fillOpacity: 1 }}
            eventHandlers={{ click: () => onStationClick(t.from_stop) }}
          />
        </Fragment>
      ))}
    </>
  )
})

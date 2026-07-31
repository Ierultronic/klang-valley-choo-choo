// ---------------------------------------------------------------------------
// ponytail: KISS — Ramer-Douglas-Peucker line simplification.
// Reduces polyline vertex count by removing points that don't add
// visible detail at the current zoom level.
//
// At zoom 12: ~25m/px → epsilon=20  → heavy reduction
// At zoom 16:  ~2m/px  → epsilon=2   → mild reduction
// At zoom 20:  ~0.3m/px → epsilon=0.3 → minimal
// ---------------------------------------------------------------------------

/** Simplify a polyline of [lat, lon] points using RDP.
 *  `epsilon` is in degrees (roughly 111,000m per degree at equator).
 *  Returns a new array (does not mutate input).
 */
export function simplifyPoints(
  points: [number, number][],
  epsilon: number
): [number, number][] {
  if (points.length <= 2) return points

  // Find the point furthest from the line segment (first → last)
  const first = points[0]
  const last = points[points.length - 1]

  let maxDist = 0
  let maxIdx = 0

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPoints(points.slice(0, maxIdx + 1), epsilon)
    const right = simplifyPoints(points.slice(maxIdx), epsilon)
    // Avoid duplicating the split point
    return [...left.slice(0, -1), ...right]
  }

  return [first, last]
}

/** Perpendicular distance from point p to line a→b (in degrees). */
function perpendicularDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  // Using planar approximation — good enough for small areas
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) {
    // Degenerate line: distance to point
    return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2)
  }
  const num = Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0])
  return num / Math.sqrt(dx * dx + dy * dy)
}

/**
 * Map zoom level → epsilon in degrees.
 *
 * Reference: at zoom 0, 1 pixel ≈ 156,543m (at equator).
 * At latitude ~3°, 1° lat ≈ 111,320m, 1° lon ≈ 111,180m.
 *   1px at zoom N ≈ 156,543 / 2^N  meters
 *   1px in degrees ≈ (156,543 / 2^N) / 111,000
 *
 * We set epsilon so we drop points that shift less than ~3px.
 */
export function zoomToEpsilon(zoom: number): number {
  const metersPerPx = 156_543 / Math.pow(2, zoom)
  const degreesPerPx = metersPerPx / 111_000
  // Drop vertices that deviate less than 3px from the chord
  return degreesPerPx * 3
}

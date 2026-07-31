/** GTFS route_color to hex. Falls back to muted gray. */
export function routeHex(color?: string, fallback = '#6b7280'): string {
  return color ? `#${color}` : fallback
}

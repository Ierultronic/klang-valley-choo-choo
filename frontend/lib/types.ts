// ponytail: shared TypeScript types for transit data.
// Extracted from Map.tsx to avoid duplication across components.

export type Vehicle = {
  vehicle_id: string; lat: number; lon: number; bearing: number
  speed: number; delay_seconds: number; route_id: string; fetched_at: string
}

export type Shape = {
  shape_id: string; route_id: string; points: { lat: number; lon: number }[]
}

export type Route = {
  route_id: string; route_short_name: string; route_long_name: string
  route_color: string; route_type: number
}

export type Station = {
  stop_id: string; stop_name: string; stop_lat: number; stop_lon: number
  route_ids: string[]; route_names: string[]; route_color: string
}

export type ETA = {
  arrival_time: string; route_id: string; route_name: string
  route_color: string; trip_id: string; direction_id: number; headsign: string
}

export type RouteLeg = {
  route_id: string; route_name: string; route_color: string
  direction_id: number; stops_between: number; duration_sec: number; shape_id: string
  from_stop: Station; to_stop: Station; stops?: string[]
}

export type TransferPoint = {
  from_stop: Station; to_stop: Station; distance_m: number
}

export type RoutePlanRoute = {
  route_id?: string; route_name?: string; route_color?: string
  direction_id?: number; stops_between?: number; duration_sec?: number; shape_id?: string
  legs: RouteLeg[]
  transfers?: TransferPoint[]
  transfer_at?: Station
}

export type RoutePlanResult = {
  routes: RoutePlanRoute[]; from_stop: Station; to_stop: Station
}

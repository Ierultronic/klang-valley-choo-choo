'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Vehicle, Shape, Route, Station } from './types'
import { API_URL } from './api'

// ---------------------------------------------------------------------------
// ponytail: KISS — custom data-fetching hooks with proper cleanup.
// Each hook manages its own lifecycle. Map.tsx just consumes the data.
// ---------------------------------------------------------------------------

/** Fetch stations once on mount. */
export function useStationData(): Station[] {
  const [stations, setStations] = useState<Station[]>([])
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    fetch(`${API_URL}/api/stations`)
      .then(r => r.json())
      .then(data => { if (mounted.current) setStations(data) })
      .catch(() => {})
    return () => { mounted.current = false }
  }, [])

  return stations
}

/** Fetch vehicles every 30s. Cleans up interval on unmount. */
export function useVehicleData(): Vehicle[] {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const mounted = useRef(true)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/vehicles`)
      if (!res.ok) return
      const data = await res.json()
      // Batch update — only one setState call regardless of vehicle count
      if (mounted.current) setVehicles(data.vehicles || [])
    } catch {}
  }, [])

  useEffect(() => {
    mounted.current = true
    fetchVehicles()
    intervalRef.current = setInterval(fetchVehicles, 30000)
    return () => {
      mounted.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchVehicles])

  return vehicles
}

/** Fetch shapes once on mount. */
export function useShapeData(): Shape[] {
  const [shapes, setShapes] = useState<Shape[]>([])
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    fetch(`${API_URL}/api/shapes`)
      .then(r => r.json())
      .then(data => { if (mounted.current) setShapes(data) })
      .catch(() => {})
    return () => { mounted.current = false }
  }, [])

  return shapes
}

/** Fetch routes once on mount. */
export function useRouteData(): Route[] {
  const [routes, setRoutes] = useState<Route[]>([])
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    fetch(`${API_URL}/api/routes`)
      .then(r => r.json())
      .then(data => { if (mounted.current) setRoutes(data) })
      .catch(() => {})
    return () => { mounted.current = false }
  }, [])

  return routes
}

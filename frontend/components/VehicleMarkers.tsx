'use client'

import { useEffect, useState } from 'react'
import { Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Vehicle } from '../lib/types'

// ---------------------------------------------------------------------------
// ponytail: KISS-001 — vehicle marker layer extracted from Map.tsx.
// ---------------------------------------------------------------------------

export function delayColor(sec: number): string {
  if (sec < 120) return '#22c55e'
  if (sec < 300) return '#eab308'
  return '#ef4444'
}

function createIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

const userIcon = L.divIcon({
  className: '',
  html: `<div style="width:20px;height:20px;background:#2563eb;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><div style="width:8px;height:8px;background:#fff;border-radius:50%"></div></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

export function VehicleMarker({ v }: { v: Vehicle }) {
  const color = delayColor(v.delay_seconds)
  return (
    <Marker position={[v.lat, v.lon]} icon={createIcon(color)}>
      <Popup>
        <b>{v.vehicle_id}</b><br />
        Route: {v.route_id || 'unknown'}<br />
        Delay: {v.delay_seconds > 0 ? `${Math.round(v.delay_seconds / 60)} min` : 'on time'}<br />
        Speed: {(v.speed || 0).toFixed(1)} km/h
      </Popup>
    </Marker>
  )
}

export function UserLocation() {
  const map = useMap()
  const [pos, setPos] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      p => {
        const c: [number, number] = [p.coords.latitude, p.coords.longitude]
        setPos(c)
        map.flyTo(c, 14, { duration: 2 })
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000 }
    )
  }, [map])

  if (!pos) return null
  return (
    <Marker position={pos} icon={userIcon}>
      <Popup>You are here</Popup>
    </Marker>
  )
}

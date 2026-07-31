'use client'

import { useEffect, useState } from 'react'
import { Station, ETA } from '../lib/types'
import { API_URL } from '../lib/api'

// ---------------------------------------------------------------------------
// ponytail: KISS-001 — station ETA popup extracted from Map.tsx.
// ---------------------------------------------------------------------------

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

function minsUntil(arrival: string): string {
  const [h, m] = arrival.split(':').map(Number)
  const n = new Date()
  const myt = new Date(n.getTime() + n.getTimezoneOffset() * 60000 + 28800000)
  const d = h * 60 + m - (myt.getHours() * 60 + myt.getMinutes())
  if (d <= 0) return 'now'
  if (d < 60) return `${d} min`
  return `${Math.floor(d / 60)}h ${d % 60}m`
}

export function StationPopup({ station, onClose }: {
  station: Station
  onClose: () => void
}) {
  const [etas, setEtas] = useState<ETA[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`${API_URL}/api/stations/${station.stop_id}/eta`)
      .then(r => r.json())
      .then(data => { setEtas(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [station.stop_id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const dirEtas = (dir: number) => etas.filter(e => e.direction_id === dir).slice(0, 3)

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.3)',
        }}
      />
      <div style={{
        position: 'fixed', top: 10, right: 10, zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.8)', borderRadius: 10, padding: 16, width: 300,
        boxShadow: '0 4px 16px rgba(0,0,0,.2)', fontFamily: 'system-ui, sans-serif',
        maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{station.stop_name}</div>
            <div style={{ fontSize: 12, color: '#666' }}>
              {station.route_names.slice(0, 3).join(' / ')}{station.route_names.length > 3 ? ' +more' : ''}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
            color: '#999', padding: '0 4px', lineHeight: 1,
          }}>×</button>
        </div>

        {loading ? (
          <div style={{ color: '#999', padding: '20px 0', textAlign: 'center', fontSize: 13 }}>Loading schedule...</div>
        ) : etas.length === 0 ? (
          <div style={{ color: '#999', padding: '20px 0', textAlign: 'center', fontSize: 13 }}>No upcoming arrivals</div>
        ) : (
          [0, 1].map(dir => {
            const items = dirEtas(dir)
            if (!items.length) return null
            return (
              <div key={dir} style={{ marginTop: dir === 1 ? 12 : 0 }}>
                <div style={{
                  fontWeight: 600, fontSize: 13, color: '#555', marginBottom: 6,
                  paddingBottom: 4, borderBottom: '1px solid #eee',
                }}>
                  {items[0]?.headsign || (dir === 0 ? 'Direction A' : 'Direction B')}
                </div>
                {items.map((e, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                  }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: e.route_color ? `#${e.route_color}` : '#666',
                    }} />
                    <span style={{ flex: 1, fontSize: 13, color: '#333' }}>{e.route_name}</span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      {fmtTime(e.arrival_time)}{' '}
                      <span style={{ fontWeight: 400, fontSize: 11, color: '#888' }}>
                        ({minsUntil(e.arrival_time)})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Station, ETA } from '../lib/types'
import { API_URL } from '../lib/api'
import { routeHex } from '../lib/colors'

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
        background: 'var(--kv-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', width: 300,
        boxShadow: 'var(--shadow-md)', fontFamily: 'var(--font-ui)',
        maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
          <div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{station.stop_name}</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--kv-muted)' }}>
              {station.route_names.slice(0, 3).join(' / ')}{station.route_names.length > 3 ? ' +more' : ''}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 'var(--text-xl)', cursor: 'pointer',
            color: 'var(--kv-muted)', padding: 0, lineHeight: 1,
            minWidth: 'var(--touch-target-min)', minHeight: 'var(--touch-target-min)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--kv-muted)', padding: 'var(--space-5) 0', textAlign: 'center', fontSize: 'var(--text-sm)' }}>Loading schedule...</div>
        ) : etas.length === 0 ? (
          <div style={{ color: 'var(--kv-muted)', padding: 'var(--space-5) 0', textAlign: 'center', fontSize: 'var(--text-sm)' }}>No upcoming arrivals</div>
        ) : (
          [0, 1].map(dir => {
            const items = dirEtas(dir)
            if (!items.length) return null
            return (
              <div key={dir} style={{ marginTop: dir === 1 ? 'var(--space-3)' : 0 }}>
                <div style={{
                  fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--kv-muted)', marginBottom: 6,
                  paddingBottom: 'var(--space-1)', borderBottom: '1px solid var(--kv-border)',
                }}>
                  {items[0]?.headsign || (dir === 0 ? 'Direction A' : 'Direction B')}
                </div>
                {items.map((e, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1) 0',
                  }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: routeHex(e.route_color),
                    }} />
                    <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--kv-ink)' }}>{e.route_name}</span>
                    <span style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>
                      {fmtTime(e.arrival_time)}{' '}
                      <span style={{ fontWeight: 400, fontSize: 'var(--text-xs)', color: 'var(--kv-muted)' }}>
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

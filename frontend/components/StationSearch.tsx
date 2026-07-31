'use client'

import { useEffect, useLayoutEffect, useState, useRef } from 'react'
import { Station } from '../lib/types'
import { routeHex } from '../lib/colors'

// ---------------------------------------------------------------------------
// ponytail: KISS-001 — station search bar with dropdown extracted from Map.tsx.
// ---------------------------------------------------------------------------

export function StationSearch({ stations, onSelect, placeholder }: {
  stations: Station[]
  onSelect: (s: Station) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const filtered = query.trim()
    ? stations.filter(s => s.stop_name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : []

  useLayoutEffect(() => {
    if (!focused || !inputRef.current) return
    inputRef.current.scrollIntoView({ block: 'nearest' })
    const r = inputRef.current.getBoundingClientRect()
    setDropPos({ top: r.bottom + 6, left: r.left, width: r.width })
  }, [focused, query])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node) &&
          dropRef.current && !dropRef.current.contains(e.target as Node)) setFocused(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <>
      <div ref={inputRef} style={{
        position: 'relative', flex: 1,
      }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            background: focused ? 'var(--kv-surface)' : 'var(--kv-surface)',
            opacity: focused ? 1 : 0.85,
            border: focused ? '1.5px solid #2563eb' : '1.5px solid transparent',
            borderRadius: 'var(--radius-md)', padding: '0 var(--space-3)',
            boxShadow: focused
              ? '0 4px 20px rgba(37,99,235,.15), 0 1px 3px rgba(0,0,0,.08)'
              : 'var(--shadow-sm)',
            transition: 'box-shadow .15s, border .15s',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={focused ? '#2563eb' : 'var(--kv-muted)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              placeholder={placeholder || 'Search stations...'}
              value={query}
              onChange={e => { setQuery(e.target.value); setFocused(true) }}
              onFocus={() => setFocused(true)}
              style={{
                flex: 1, border: 'none', outline: 'none', fontSize: 'var(--text-base)', padding: 'var(--space-3) 0',
                fontFamily: 'var(--font-ui)', color: 'var(--kv-ink)',
                background: 'transparent',
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{
                  background: 'var(--kv-border)', border: 'none', borderRadius: '50%', cursor: 'pointer',
                  minWidth: 'var(--touch-target-min)', minHeight: 'var(--touch-target-min)',
                  width: 'var(--touch-target-min)', height: 'var(--touch-target-min)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0, flexShrink: 0, color: 'var(--kv-muted)', fontSize: 'var(--text-sm)', lineHeight: 1,
                }}
              >✕</button>
            )}
          </div>
        </div>

        {dropPos && focused && query.length > 0 && filtered.length > 0 && (
          <div ref={dropRef} style={{
            position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999,
            background: 'var(--kv-surface)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--kv-border)',
          }}>
            <div style={{
              maskImage: "linear-gradient(to bottom, transparent 0px, black 30px, black calc(100% - 20px), transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0px, black 30px, black calc(100% - 30px), transparent 100%)",
              scrollbarWidth: 'none', overflow: 'auto', height: 260, paddingBottom: 5, paddingTop: 5,
              background: 'transparent',
            }}>
              {filtered.map(s => {
                const color = routeHex(s.route_color, '#999')
                return (
                  <button
                    key={s.stop_id}
                    onClick={() => { onSelect(s); setQuery(s.stop_name); setFocused(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: 'var(--space-3) var(--space-4)', border: 'none', borderBottom: '1px solid var(--kv-border)',
                      textAlign: 'left', cursor: 'pointer', fontSize: 'var(--text-sm)', background: 'var(--kv-surface)',
                      fontFamily: 'var(--font-ui)', transition: 'background .1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--kv-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--kv-surface)')}
                  >
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: color,
                      border: `2px solid ${color}33`,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--kv-ink)', fontSize: 'var(--text-sm)' }}>{s.stop_name}</div>
                      {s.route_names.length > 0 && (
                        <div style={{ color: 'var(--kv-muted)', fontSize: 'var(--text-xs)', marginTop: 2 }}>
                          {s.route_names.slice(0, 2).join(' · ')}
                        </div>
                      )}
                    </div>
                    <span style={{ color: 'var(--kv-muted)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>{s.stop_id}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

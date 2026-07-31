'use client'

import { useEffect, useLayoutEffect, useState, useRef } from 'react'
import { Station } from '../lib/types'

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
            display: 'flex', alignItems: 'center', gap: 8,
            background: focused ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.7)',
            border: focused ? '1.5px solid #2563eb' : '1.5px solid transparent',
            borderRadius: 10, padding: '0 12px',
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            boxShadow: focused
              ? '0 4px 20px rgba(37,99,235,.15), 0 1px 3px rgba(0,0,0,.08)'
              : '0 2px 8px rgba(0,0,0,.08)',
            transition: 'box-shadow .15s, border .15s',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={focused ? '#2563eb' : '#999'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              placeholder={placeholder || 'Search stations...'}
              value={query}
              onChange={e => { setQuery(e.target.value); setFocused(true) }}
              onFocus={() => setFocused(true)}
              style={{
                flex: 1, border: 'none', outline: 'none', fontSize: 14, padding: '10px 0',
                fontFamily: 'system-ui, sans-serif', color: '#1a1a1a',
                background: 'transparent',
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{
                  background: '#e5e7eb', border: 'none', borderRadius: '50%', cursor: 'pointer',
                  width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0, flexShrink: 0, color: '#666', fontSize: 12, lineHeight: 1,
                }}
              >✕</button>
            )}
          </div>
        </div>

        {dropPos && focused && query.length > 0 && filtered.length > 0 && (
          <div ref={dropRef} style={{
            position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999,
            background: 'rgba(255, 255, 255, 0.8)', borderRadius: 10,
            boxShadow: '0 8px 30px rgba(0,0,0,.12)',
            border: '1px solid #f0f0f0', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          }}>
            <div style={{
              maskImage: "linear-gradient(to bottom, transparent 0px, black 30px, black calc(100% - 20px), transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0px, black 30px, black calc(100% - 30px), transparent 100%)",
              scrollbarWidth: 'none', overflow: 'auto', height: 260, paddingBottom: 5, paddingTop: 5,
              background: 'transparent',
            }}>
              {filtered.map(s => {
                const color = s.route_color ? `#${s.route_color}` : '#999'
                return (
                  <button
                    key={s.stop_id}
                    onClick={() => { onSelect(s); setQuery(s.stop_name); setFocused(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '10px 14px', border: 'none', borderBottom: '1px solid #f5f5f5',
                      textAlign: 'left', cursor: 'pointer', fontSize: 13, background: 'white',
                      fontFamily: 'system-ui, sans-serif', transition: 'background .1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8f9ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                  >
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: color,
                      border: `2px solid ${color}33`,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#1a1a1a', fontSize: 13 }}>{s.stop_name}</div>
                      {s.route_names.length > 0 && (
                        <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                          {s.route_names.slice(0, 2).join(' · ')}
                        </div>
                      )}
                    </div>
                    <span style={{ color: '#bbb', fontSize: 11, fontFamily: 'monospace' }}>{s.stop_id}</span>
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

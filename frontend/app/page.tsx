'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const TransitMap = dynamic(() => import('../components/Map').then(m => ({ default: m.TransitMap })), {
  ssr: false,
})

export default function Home() {
  const [showAttrib, setShowAttrib] = useState(false)

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      <TransitMap />
      <footer style={{
        display: "flex", position: "absolute", bottom: 0, width: "100%",
        padding: 'var(--space-2) var(--space-3)', zIndex: 1000,
        justifyContent: "space-between", alignItems: "center",
        fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)',
        color: 'var(--kv-muted)',
      }}>
        <div style={{
          background: 'var(--kv-surface)', opacity: 0.92,
          padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)',
        }}>
          Data from data.gov.my &bull; Updated every 30s
        </div>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAttrib(!showAttrib)}
            title='Attribution'
            style={{
              background: 'var(--kv-surface)', opacity: 0.92,
              padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-base)', color: 'var(--kv-muted)',
              border: 'none', display: 'flex', alignItems: 'center',
              cursor: 'pointer',
              minWidth: 'var(--touch-target-min)', minHeight: 'var(--touch-target-min)',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M430-200h100v-180h60v-184q0-27-28.5-41.5T480-620q-53 0-81.5 14.5T370-564v184h60v180Zm-105 88.5q-73-31.5-127.5-86t-86-127.5Q80-398 80-480.5t31.5-155q31.5-72.5 86-127t127.5-86Q398-880 480.5-880t155 31.5q72.5 31.5 127 86t86 127Q880-563 880-480.5T848.5-325q-31.5 73-86 127.5t-127 86Q563-80 480.5-80T325-111.5Zm381.5-142Q800-347 800-480t-93.5-226.5Q613-800 480-800t-226.5 93.5Q160-613 160-480t93.5 226.5Q347-160 480-160t226.5-93.5ZM523-657q17-17 17-43t-17-43q-17-17-43-17t-43 17q-17 17-17 43t17 43q17 17 43 17t43-17Zm-43 177Z"/></svg>
          </button>
          {showAttrib && (
            <div style={{
              position: 'absolute', right: 0, bottom: '100%', marginBottom: 4,
              background: 'var(--kv-surface)', opacity: 0.92,
              padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-xs)', color: 'var(--kv-muted)',
              whiteSpace: 'nowrap',
            }}>
              &copy; {new Date().getFullYear()} Ierultronic &bull; Powered by <a style={{textDecoration:"none"}} target="_blank" href="https://leafletjs.com">Leaflet</a> &bull; Map data &copy; <a style={{textDecoration:"none"}} target="_blank" href="https://www.openstreetmap.org/copyright">OpenStreetMap Contributors</a>
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}

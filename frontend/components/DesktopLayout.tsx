/* DesktopLayout — sidebar + map split for ≥768px viewports */
/* Same components as mobile, different container. No bottom sheet. */

'use client'

import React from 'react'

interface DesktopLayoutProps {
  /** Top content (e.g. ServiceAlertBanner) */
  top?: React.ReactNode
  /** Sidebar content (station list, route planner, etc.) */
  sidebar: React.ReactNode
  /** Full-bleed map */
  canvas: React.ReactNode
  /** Optional bottom bar (attribution, etc.) */
  footer?: React.ReactNode
}

const SIDEBAR_WIDTH = 360

export function DesktopLayout({
  top,
  sidebar,
  canvas,
  footer,
}: DesktopLayoutProps) {
  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--kv-bg)',
      }}
    >
      {/* Top banner */}
      {top && (
        <div style={{ flexShrink: 0, zIndex: 800 }}>
          {top}
        </div>
      )}

      {/* Main content: sidebar + map */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            width: `${SIDEBAR_WIDTH}px`,
            minWidth: `${SIDEBAR_WIDTH}px`,
            background: 'var(--kv-surface)',
            borderRight: '1px solid var(--kv-border)',
            overflowY: 'auto',
            overflowX: 'hidden',
            zIndex: 100,
            position: 'relative',
          }}
        >
          {sidebar}
        </aside>

        {/* Map canvas */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: 'var(--kv-map-bg)',
          }}
        >
          {canvas}
        </div>
      </div>

      {/* Optional footer */}
      {footer && (
        <div style={{ flexShrink: 0, zIndex: 800 }}>
          {footer}
        </div>
      )}
    </div>
  )
}

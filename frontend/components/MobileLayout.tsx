/* MobileLayout — mobile-first container (bottom sheet + tab bar) */
/* Zero AI slop: no gradients, no glassmorphism, no centered hero. */

'use client'

import React from 'react'

interface MobileLayoutProps {
  /** Top content (e.g. ServiceAlertBanner) */
  top?: React.ReactNode
  /** Full-bleed content behind (e.g. Map) */
  canvas: React.ReactNode
  /** Bottom sheet content */
  sheet: React.ReactNode
  /** Bottom tab bar */
  tabBar: React.ReactNode
  /** Content to show when bottom sheet is collapsed */
  sheetCollapsed?: React.ReactNode
}

export function MobileLayout({
  top,
  canvas,
  sheet,
  tabBar,
}: MobileLayoutProps) {
  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--kv-map-bg)',
      }}
    >
      {/* Top banner */}
      {top && (
        <div style={{ position: 'relative', zIndex: 800, flexShrink: 0 }}>
          {top}
        </div>
      )}

      {/* Map canvas — full bleed behind everything */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
        }}
      >
        {canvas}
      </div>

      {/* Bottom sheet + tab bar stack */}
      <div
        style={{
          position: 'relative',
          zIndex: 900,
          flex: 1,
          pointerEvents: 'none',
        }}
      >
        {/* Pointer events pass through to map except on the sheet/tabs themselves */}
        <div style={{ pointerEvents: 'auto' }}>
          {sheet}
        </div>
      </div>

      {tabBar}
    </div>
  )
}

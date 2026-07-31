/* ResponsiveLayout — switches between MobileLayout and DesktopLayout at 768px */

'use client'

import React, { useEffect, useState } from 'react'
import { MobileLayout } from './MobileLayout'
import { DesktopLayout } from './DesktopLayout'

interface ResponsiveLayoutProps {
  /** Top content (e.g. ServiceAlertBanner) — shown on both layouts */
  top?: React.ReactNode
  /** Full-bleed map canvas */
  canvas: React.ReactNode
  /** Content that goes into bottom sheet (mobile) or sidebar (desktop) */
  panel: React.ReactNode
  /** Collapsed sheet content (mobile only) */
  panelCollapsed?: React.ReactNode
  /** Bottom tab bar (mobile only) */
  tabBar: React.ReactNode
  /** Footer/attribution (desktop only) */
  footer?: React.ReactNode
}

const BREAKPOINT = 768

export function ResponsiveLayout({
  top,
  canvas,
  panel,
  panelCollapsed,
  tabBar,
  footer,
}: ResponsiveLayoutProps) {
  const [isMobile, setIsMobile] = useState(true)

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < BREAKPOINT)
    }
    check()
    const mql = window.matchMedia(`(max-width: ${BREAKPOINT - 1}px)`)
    mql.addEventListener('change', check)
    return () => mql.removeEventListener('change', check)
  }, [])

  if (isMobile) {
    return (
      <MobileLayout
        top={top}
        canvas={canvas}
        sheet={panel}
        sheetCollapsed={panelCollapsed}
        tabBar={tabBar}
      />
    )
  }

  return (
    <DesktopLayout
      top={top}
      canvas={canvas}
      sidebar={panel}
      footer={footer}
    />
  )
}

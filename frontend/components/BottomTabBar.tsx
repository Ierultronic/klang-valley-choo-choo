'use client'

import React from 'react'

/* ── TYPES ── */

export type TabId = 'explore' | 'routes' | 'alerts'

interface TabConfig {
  id: TabId
  label: string
  icon: React.FC<{ color: string; hasAlert?: boolean }>
}

interface BottomTabBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  hasAlerts?: boolean
}

/* ── ICONS ── */

function ExploreIcon({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function RoutesIcon({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function AlertsIcon({ color, hasAlert }: { color: string; hasAlert?: boolean }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {hasAlert && (
        <span
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--kv-danger)',
            border: '2px solid var(--kv-surface)',
          }}
        />
      )}
    </span>
  )
}

/* ── TABS ── */

const TABS: TabConfig[] = [
  {
    id: 'explore',
    label: 'Explore',
    icon: ExploreIcon,
  },
  {
    id: 'routes',
    label: 'Routes',
    icon: RoutesIcon,
  },
  {
    id: 'alerts',
    label: 'Alerts',
    icon: AlertsIcon,
  },
]

/* ── COMPONENT ── */

export function BottomTabBar({ activeTab, onTabChange, hasAlerts }: BottomTabBarProps) {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        height: 'var(--tab-bar-height)',
        background: 'var(--kv-surface)',
        borderTop: '1px solid var(--kv-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        boxShadow: '0 -1px 3px rgba(0,0,0,.04)',
      }}
      role="tablist"
      aria-label="Main navigation"
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.id
        const color = active ? 'var(--kv-ink)' : 'var(--kv-muted)'

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(tab.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              minWidth: 'var(--touch-target-min)',
              minHeight: 'var(--touch-target-min)',
              border: 'none',
              background: 'transparent',
              color,
              fontSize: 'var(--text-xs)',
              fontWeight: active ? 600 : 500,
              fontFamily: 'var(--font-ui)',
              cursor: 'pointer',
              padding: 'var(--space-1)',
              WebkitTapHighlightColor: 'transparent',
              transition: 'color 150ms ease',
            }}
          >
            {tab.id === 'alerts'
              ? <AlertsIcon color={color} hasAlert={hasAlerts} />
              : React.createElement(tab.icon, { color })
            }
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

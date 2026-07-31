'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { ResponsiveLayout } from '../components/ResponsiveLayout'
import { BottomSheet } from '../components/BottomSheet'
import { BottomTabBar, type TabId } from '../components/BottomTabBar'
import { ServiceBar } from '../components/ServiceBar'

const TransitMap = dynamic(() => import('../components/Map').then(m => ({ default: m.TransitMap })), {
  ssr: false,
})

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('explore')

  return (
    <ResponsiveLayout
      // Top banner — existing ServiceBar (will be refactored to ServiceAlertBanner in Phase 2)
      top={<ServiceBar />}

      // Map canvas — full-bleed spatial reference
      canvas={<TransitMap />}

      // Bottom sheet content (placeholder — Phase 2 will fill with real components)
      panel={
        <BottomSheet
          initialLevel="collapsed"
          collapsedContent={
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--kv-muted)' }}>
              Tap to start exploring
            </div>
          }
        >
          {/* Phase 2 placeholder: station search, nearby list, ETA details */}
          <div style={{ padding: 'var(--space-4)' }}>
            {activeTab === 'explore' && (
              <div>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
                  Nearby Stations
                </h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--kv-muted)' }}>
                  Station list coming in Phase 2. Use the search bar on the map to find stations.
                </p>
              </div>
            )}
            {activeTab === 'routes' && (
              <div>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
                  Route Planner
                </h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--kv-muted)' }}>
                  Route planner moving here in Phase 2. Use the Routes tab on the map for now.
                </p>
              </div>
            )}
            {activeTab === 'alerts' && (
              <div>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
                  Service Alerts
                </h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--kv-muted)' }}>
                  Full alert details coming in Phase 2. Check the status panel on the map for live service status.
                </p>
              </div>
            )}
          </div>
        </BottomSheet>
      }

      // Bottom tab bar
      tabBar={
        <BottomTabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
    />
  )
}

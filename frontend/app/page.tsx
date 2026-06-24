'use client'

import dynamic from 'next/dynamic'
import { ServiceBar } from '../components/ServiceBar'

const TransitMap = dynamic(() => import('../components/Map').then(m => ({ default: m.TransitMap })), {
  ssr: false,
})

export default function Home() {
  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      <TransitMap />
      <ServiceBar />
      <div style={{
        position: 'absolute', bottom: 4, left: 4, zIndex: 1000,
        background: 'rgba(255,255,255,.85)', padding: '3px 8px', borderRadius: 5,
        fontSize: 11, color: '#666',
      }}>
        Data from data.gov.my &bull; Updated every 30s
      </div>
    </div>
  )
}

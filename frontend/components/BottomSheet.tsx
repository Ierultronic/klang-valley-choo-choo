'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/* ── TYPES ── */

export type SheetLevel = 'collapsed' | 'half' | 'full'

interface BottomSheetProps {
  children: React.ReactNode
  /** Initial sheet level (default: 'collapsed') */
  initialLevel?: SheetLevel
  /** Callback when level changes */
  onLevelChange?: (level: SheetLevel) => void
  /** Override the sheet's expanded height (for when map needs adjusting) */
  onHeightChange?: (height: number) => void
  /** Content to show when collapsed (e.g. active trip summary). If omitted, nothing renders at collapsed. */
  collapsedContent?: React.ReactNode
}

/* ── CONSTANTS ── */

const SHEET_HANDLE_HEIGHT = 20
const VELOCITY_THRESHOLD = 0.5 // px/ms — snap if dragged faster than this
const SHEET_ANIMATION = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)'

/* ── HELPERS ── */

function levelToOffset(level: SheetLevel, viewportHeight: number, collapsedOffset: number): number {
  switch (level) {
    case 'collapsed':
      return collapsedOffset
    case 'half':
      return viewportHeight * 0.5
    case 'full':
      return viewportHeight * 0.9
  }
}

function offsetToLevel(offset: number, viewportHeight: number, collapsedOffset: number): SheetLevel {
  const halfPx = viewportHeight * 0.5
  const fullPx = viewportHeight * 0.9
  const midCollapsedHalf = (collapsedOffset + halfPx) / 2
  const midHalfFull = (halfPx + fullPx) / 2

  if (offset < midCollapsedHalf) return 'collapsed'
  if (offset < midHalfFull) return 'half'
  return 'full'
}

/* ── COMPONENT ── */

export function BottomSheet({
  children,
  initialLevel = 'collapsed',
  onLevelChange,
  onHeightChange,
  collapsedContent,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [level, setLevel] = useState<SheetLevel>(initialLevel)
  const [animating, setAnimating] = useState(false)
  const [viewportH, setViewportH] = useState(0)

  // Track current drag
  const dragging = useRef(false)
  const startY = useRef(0)
  const startOffset = useRef(0)
  const lastY = useRef(0)
  const lastTime = useRef(0)
  const rafId = useRef(0)
  const currentOffset = useRef(0)

  const collapsedOffset = viewportH - SHEET_HANDLE_HEIGHT

  /* ── Resize ── */

  useEffect(() => {
    const update = () => {
      const h = window.innerHeight
      setViewportH(h)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  /* ── Report height changes ── */

  useEffect(() => {
    if (!viewportH) return
    const offset = levelToOffset(level, viewportH, collapsedOffset)
    currentOffset.current = offset
    onHeightChange?.(viewportH - offset)
  }, [level, viewportH, collapsedOffset, onHeightChange])

  /* ── Pointer event handlers ── */

  const applyOffset = useCallback((offset: number, animate: boolean) => {
    const el = sheetRef.current
    if (!el) return
    const clamped = Math.max(viewportH * 0.1, Math.min(offset, collapsedOffset))
    currentOffset.current = clamped

    if (animate) {
      setAnimating(true)
      el.style.transition = SHEET_ANIMATION
      // Determine target level for the animation
      const targetLevel = offsetToLevel(clamped, viewportH, collapsedOffset)
      const targetOffset = levelToOffset(targetLevel, viewportH, collapsedOffset)
      el.style.transform = `translateY(${targetOffset}px)`

      const onTransitionEnd = () => {
        el.style.transition = ''
        setAnimating(false)
        const finalLevel = offsetToLevel(targetOffset, viewportH, collapsedOffset)
        setLevel(finalLevel)
        onLevelChange?.(finalLevel)
        el.removeEventListener('transitionend', onTransitionEnd)
      }
      el.addEventListener('transitionend', onTransitionEnd)
    } else {
      el.style.transition = ''
      el.style.transform = `translateY(${clamped}px)`
    }
  }, [viewportH, collapsedOffset, onLevelChange])

  // Initialize
  useEffect(() => {
    if (!viewportH) return
    const offset = levelToOffset(initialLevel, viewportH, collapsedOffset)
    currentOffset.current = offset
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${offset}px)`
    }
  }, [viewportH, initialLevel, collapsedOffset])

  /* ── Touch handlers ── */

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    startY.current = e.clientY
    startOffset.current = currentOffset.current
    lastY.current = e.clientY
    lastTime.current = Date.now()

    // Cancel any ongoing animation
    const el = sheetRef.current
    if (el) {
      el.style.transition = ''
    }

    e.preventDefault()
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return

    cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => {
      const dy = startY.current - e.clientY
      let offset = startOffset.current - dy

      // Clamp between 10% viewport (full) and collapsed
      const minOffset = viewportH * 0.1
      offset = Math.max(minOffset, Math.min(offset, collapsedOffset))

      const el = sheetRef.current
      if (el) {
        el.style.transform = `translateY(${offset}px)`
      }

      lastY.current = e.clientY
      lastTime.current = Date.now()

      // Report intermediate height
      onHeightChange?.(viewportH - offset)
    })
  }, [viewportH, collapsedOffset, onHeightChange])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false

    cancelAnimationFrame(rafId.current)

    const el = sheetRef.current
    if (!el) return

    // Calculate velocity
    const dt = Date.now() - lastTime.current
    const dy = lastY.current - e.clientY
    const velocity = dt > 0 ? Math.abs(dy) / dt : 0

    // Get current offset from transform
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    const currentY = matrix.m42 || currentOffset.current

    // Determine snap target (biased by velocity)
    let targetLevel: SheetLevel
    if (velocity > VELOCITY_THRESHOLD) {
      // Flick — go in direction of movement
      if (dy < 0) {
        // Moving up (finger down) — expand
        if (level === 'collapsed') targetLevel = 'half'
        else targetLevel = 'full'
      } else {
        // Moving down (finger up) — collapse
        if (level === 'full') targetLevel = 'half'
        else targetLevel = 'collapsed'
      }
    } else {
      // No strong flick — snap to nearest level
      targetLevel = offsetToLevel(currentY, viewportH, collapsedOffset)
    }

    const targetOffset = levelToOffset(targetLevel, viewportH, collapsedOffset)
    applyOffset(targetOffset, true)
  }, [level, viewportH, collapsedOffset, applyOffset])

  /* ── Programmatic level change ── */

  const goToLevel = useCallback((target: SheetLevel) => {
    if (!viewportH) return
    const offset = levelToOffset(target, viewportH, collapsedOffset)
    applyOffset(offset, true)
  }, [viewportH, collapsedOffset, applyOffset])

  // Expose goToLevel via a hidden method (parent can use ref)
  useEffect(() => {
    if (sheetRef.current) {
      ;(sheetRef.current as any).__goToLevel = goToLevel
    }
  }, [goToLevel])

  /* ── Cleanup ── */

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafId.current)
    }
  }, [])

  /* ── RENDER ── */

  if (!viewportH) return null

  const isCollapsed = level === 'collapsed'
  const sheetTopRadius = isCollapsed
    ? 'var(--radius-lg) var(--radius-lg) 0 0'
    : 'var(--radius-lg) var(--radius-lg) 0 0'

  return (
    <div
      ref={sheetRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{
        position: 'fixed',
        bottom: 'var(--tab-bar-height)',
        left: 0,
        right: 0,
        zIndex: 900,
        background: 'var(--kv-surface)',
        borderRadius: sheetTopRadius,
        boxShadow: 'var(--shadow-md)',
        maxHeight: 'calc(90vh - var(--tab-bar-height))',
        minHeight: `${SHEET_HANDLE_HEIGHT}px`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Drag handle */}
      <div
        style={{
          height: `${SHEET_HANDLE_HEIGHT}px`,
          minHeight: `${SHEET_HANDLE_HEIGHT}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: 'var(--kv-border)',
          }}
        />
      </div>

      {/* Collapsed content (only visible when collapsed) */}
      {isCollapsed && collapsedContent && (
        <div
          style={{
            padding: '0 var(--space-4) var(--space-2)',
            overflow: 'hidden',
          }}
        >
          {collapsedContent}
        </div>
      )}

      {/* Main content (visible when expanded) */}
      {!isCollapsed && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'var(--space-4)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

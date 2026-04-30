import { useEffect, useMemo, useRef, useState } from 'react'

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function readStoredPos(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const x = Number(parsed.x)
    const y = Number(parsed.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
  } catch {
    return null
  }
}

function writeStoredPos(storageKey, pos) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ x: pos.x, y: pos.y }))
  } catch {}
}

/**
 * A small fixed-position wrapper that lets the user drag any “legend / popup”
 * around the screen. Position is persisted to localStorage.
 *
 * Drag behavior:
 * - Click/touch anywhere on the panel to drag.
 * - Stays within viewport bounds (approx; clamps by top-left).
 */
export default function DraggableFloatingPanel({
  storageKey,
  defaultPosition = { x: 80, y: 100 },
  zIndex = 50,
  children,
}) {
  const initial = useMemo(() => readStoredPos(storageKey) || defaultPosition, [storageKey, defaultPosition])
  const [pos, setPos] = useState(initial)
  const dragRef = useRef({
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
  })

  useEffect(() => {
    writeStoredPos(storageKey, pos)
  }, [storageKey, pos])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current.dragging) return
      const clientX = e.touches?.[0]?.clientX ?? e.clientX
      const clientY = e.touches?.[0]?.clientY ?? e.clientY
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return
      const dx = clientX - dragRef.current.startX
      const dy = clientY - dragRef.current.startY

      const next = {
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      }

      // Clamp to viewport (top-left only; keeps it from going fully offscreen).
      const vw = window.innerWidth || 0
      const vh = window.innerHeight || 0
      const PAD = 8
      next.x = clamp(next.x, PAD, Math.max(PAD, vw - PAD))
      next.y = clamp(next.y, PAD, Math.max(PAD, vh - PAD))

      setPos(next)
    }

    const onUp = () => {
      if (!dragRef.current.dragging) return
      dragRef.current.dragging = false
      dragRef.current.pointerId = null
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseup', onUp, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp, { passive: true })
    window.addEventListener('touchcancel', onUp, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
      window.removeEventListener('touchcancel', onUp)
    }
  }, [])

  const startDrag = (e) => {
    // Don’t start a drag from right-click.
    if (e.button != null && e.button !== 0) return
    const clientX = e.touches?.[0]?.clientX ?? e.clientX
    const clientY = e.touches?.[0]?.clientY ?? e.clientY
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return

    dragRef.current.dragging = true
    dragRef.current.startX = clientX
    dragRef.current.startY = clientY
    dragRef.current.startPosX = pos.x
    dragRef.current.startPosY = pos.y
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex,
        pointerEvents: 'auto',
        cursor: dragRef.current.dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onMouseDown={startDrag}
      onTouchStart={startDrag}
      aria-label="Draggable overlay panel"
    >
      {children}
    </div>
  )
}


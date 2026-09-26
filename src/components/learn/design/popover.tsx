"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"

/**
 * A floating panel anchored to a button. It is portalled to the body, so a
 * toolbar that scrolls sideways on a phone (overflow: auto) cannot clip it,
 * and it is placed with fixed coordinates that stay inside the viewport.
 *
 * Closes on Escape (focus returns to the button) and on a press outside both
 * the panel and its button. Carries `data-keep-editing`, so choosing a colour
 * while typing in a text box does not end the typing.
 */

type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end" | "right-start"

interface PopoverProps {
  open: boolean
  anchor: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  placement?: Placement
  label: string
  className?: string
  /** Width in px used for placement before the panel has been measured. */
  width?: number
}

const GAP = 8
const MARGIN = 8

export function Popover({ open, anchor, onClose, children, placement = "bottom-start", label, className = "", width = 280 }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const closeRef = useRef(onClose)
  useLayoutEffect(() => {
    closeRef.current = onClose
  })

  const place = useCallback(() => {
    const button = anchor.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const panel = panelRef.current
    const panelWidth = panel?.offsetWidth || width
    const panelHeight = panel?.offsetHeight || 240
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    let left = placement.endsWith("end") ? rect.right - panelWidth : rect.left
    let top = placement.startsWith("top") ? rect.top - GAP - panelHeight : rect.bottom + GAP
    if (placement === "right-start") {
      left = rect.right + GAP
      top = rect.top
    }
    // Flip vertically when there is no room, then clamp into the viewport.
    if (placement.startsWith("bottom") && top + panelHeight > viewportHeight - MARGIN && rect.top - GAP - panelHeight >= MARGIN) top = rect.top - GAP - panelHeight
    if (placement.startsWith("top") && top < MARGIN && rect.bottom + GAP + panelHeight <= viewportHeight - MARGIN) top = rect.bottom + GAP
    left = Math.max(MARGIN, Math.min(left, viewportWidth - panelWidth - MARGIN))
    top = Math.max(MARGIN, Math.min(top, viewportHeight - Math.min(panelHeight, viewportHeight - MARGIN * 2) - MARGIN))
    setPosition((current) => {
      const next = { left: Math.round(left), top: Math.round(top), maxHeight: Math.max(160, viewportHeight - MARGIN * 2) }
      return current && current.left === next.left && current.top === next.top && current.maxHeight === next.maxHeight ? current : next
    })
  }, [anchor, placement, width])

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    place()
    // Measure again once the panel has its real size.
    const frame = window.requestAnimationFrame(place)
    return () => window.cancelAnimationFrame(frame)
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (panelRef.current?.contains(target) || anchor.current?.contains(target)) return
      closeRef.current()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      closeRef.current()
      anchor.current?.focus()
    }
    const onMove = () => place()
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("resize", onMove)
    window.addEventListener("scroll", onMove, true)
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onMove)
    if (observer && panelRef.current) observer.observe(panelRef.current)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("resize", onMove)
      window.removeEventListener("scroll", onMove, true)
      observer?.disconnect()
    }
  }, [anchor, open, place])

  if (!open || typeof document === "undefined") return null
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      data-keep-editing="true"
      className={`learn-pop-in fixed z-[120] overflow-y-auto rounded-2xl border border-border bg-popover p-3 text-sm text-popover-foreground shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45)] ${className}`}
      style={{ left: position?.left ?? -9999, top: position?.top ?? -9999, maxHeight: position?.maxHeight, visibility: position ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  )
}

interface PopoverButtonProps {
  label: string
  /** Button content; the label is the accessible name and tooltip. */
  children: ReactNode
  panel: (close: () => void) => ReactNode
  buttonClassName?: string
  panelClassName?: string
  placement?: Placement
  width?: number
  disabled?: boolean
  active?: boolean
}

/**
 * A toolbar button that opens a popover. Pressing it does not take focus away
 * from a text box being typed in (the press is prevented from focusing).
 */
export function PopoverButton({ label, children, panel, buttonClassName = "canvas-tool", panelClassName = "", placement, width, disabled, active }: PopoverButtonProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-active={open || active ? "true" : "false"}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        {children}
      </button>
      <Popover open={open} anchor={buttonRef} onClose={close} label={label} placement={placement} width={width} className={panelClassName}>
        <div id={id}>{panel(close)}</div>
      </Popover>
    </>
  )
}

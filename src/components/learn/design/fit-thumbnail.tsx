"use client"

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react"

import type { DesignPage } from "@/lib/design/document"
import type { MeasureText } from "@/lib/design/text"

import { DesignThumbnail } from "./design-renderer"

/**
 * A page thumbnail that fills the width of its box: the box keeps the page's
 * proportions and the page is drawn at whatever width the layout gave it.
 */

interface FitThumbnailProps {
  width: number
  height: number
  theme: string
  page: DesignPage
  measure: MeasureText
  className?: string
  style?: CSSProperties
  /** Clamp very tall pages (an infographic) to this box height; the top shows. */
  maxHeight?: number
}

export function FitThumbnail({ width, height, theme, page, measure, className = "", style, maxHeight }: FitThumbnailProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const read = () => {
      const next = Math.floor(node.getBoundingClientRect().width)
      setBoxWidth((current) => (current === next ? current : next))
    }
    read()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(read)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: `${width} / ${height}`, maxHeight, ...style }}>
      {boxWidth > 0 ? <DesignThumbnail displayWidth={boxWidth} width={width} height={height} theme={theme} page={page} measure={measure} /> : null}
    </div>
  )
}

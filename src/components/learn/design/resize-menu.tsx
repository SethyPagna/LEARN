"use client"

import { useState } from "react"
import { CopyPlus, Scaling } from "lucide-react"

import type { DesignDoc } from "@/lib/design/document"
import { designFormatGroups, designFormats, formatForSize, MAX_PAGE_EDGE, MIN_PAGE_EDGE, type DesignFormatId } from "@/lib/design/formats"

import { PopoverButton } from "./popover"

/**
 * Resize: change every page to another format (a slide deck into a story, a
 * poster into an A4 handout) or make a resized copy and keep the original.
 *
 * "Smart" re-runs each page's layout for the new shape, so text and pictures
 * are rearranged rather than squeezed; "Scale" keeps every element where it is
 * and scales it evenly.
 */

export type ResizeMode = "smart" | "scale"

export interface ResizeTarget {
  format: DesignFormatId | "custom"
  width: number
  height: number
  mode: ResizeMode
}

interface ResizePanelProps {
  design: DesignDoc
  onResize: (target: ResizeTarget) => void
  onResizeCopy: (target: ResizeTarget) => void
}

export function ResizePanel({ design, onResize, onResizeCopy }: ResizePanelProps) {
  const [picked, setPicked] = useState<DesignFormatId | "custom">(design.format)
  const [width, setWidth] = useState(String(design.width))
  const [height, setHeight] = useState(String(design.height))
  const [mode, setMode] = useState<ResizeMode>("smart")

  const w = Math.round(Number(width))
  const h = Math.round(Number(height))
  const valid = Number.isFinite(w) && Number.isFinite(h) && w >= MIN_PAGE_EDGE && w <= MAX_PAGE_EDGE && h >= MIN_PAGE_EDGE && h <= MAX_PAGE_EDGE
  const pickedFormat = designFormats.find((format) => format.id === picked)
  const format: DesignFormatId | "custom" = pickedFormat && pickedFormat.width === w && pickedFormat.height === h ? pickedFormat.id : (formatForSize(w, h)?.id ?? "custom")
  const unchanged = valid && w === design.width && h === design.height && format === design.format
  const target: ResizeTarget = { format, width: w, height: h, mode }

  return (
    <div className="w-[19.5rem] space-y-3">
      <div>
        <p className="text-sm font-bold">Resize</p>
        <p className="text-[0.72rem] text-muted-foreground">
          Now {design.width} × {design.height} px · {design.pages.length} page{design.pages.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {designFormatGroups.map((group) => (
          <div key={group.id}>
            <p className="mb-1 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{group.label}</p>
            <div className="grid gap-1">
              {designFormats
                .filter((entry) => entry.group === group.id)
                .map((entry) => {
                  const active = format === entry.id
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setPicked(entry.id)
                        setWidth(String(entry.width))
                        setHeight(String(entry.height))
                      }}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${active ? "bg-primary/12 font-semibold ring-2 ring-primary" : "hover:bg-muted"}`}
                    >
                      <span className="truncate">{entry.label}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {entry.width} × {entry.height}
                      </span>
                    </button>
                  )
                })}
            </div>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold">Custom size (px)</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            aria-label="Width in pixels"
            min={MIN_PAGE_EDGE}
            max={MAX_PAGE_EDGE}
            value={width}
            onChange={(event) => {
              setPicked("custom")
              setWidth(event.target.value)
            }}
            className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums"
          />
          <span className="text-muted-foreground">×</span>
          <input
            type="number"
            inputMode="numeric"
            aria-label="Height in pixels"
            min={MIN_PAGE_EDGE}
            max={MAX_PAGE_EDGE}
            value={height}
            onChange={(event) => {
              setPicked("custom")
              setHeight(event.target.value)
            }}
            className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums"
          />
        </div>
        {!valid ? (
          <p className="mt-1 text-[0.7rem] text-destructive">
            Each side must be {MIN_PAGE_EDGE}–{MAX_PAGE_EDGE} px.
          </p>
        ) : null}
      </div>

      <div role="radiogroup" aria-label="How pages change" className="grid grid-cols-2 gap-1">
        {(
          [
            ["smart", "Smart layout", "Rearranges each page for the new shape"],
            ["scale", "Scale", "Keeps every element where it is"],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            title={hint}
            onClick={() => setMode(value)}
            className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${mode === value ? "bg-foreground text-background" : "bg-muted hover:bg-accent"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!valid || unchanged}
          onClick={() => onResize(target)}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          aria-label="Resize" title="Resize">
          <Scaling className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!valid}
          onClick={() => onResizeCopy(target)}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-muted text-sm font-semibold transition hover:bg-accent disabled:opacity-50"
        >
          <CopyPlus className="h-4 w-4" aria-hidden="true" />
          Resize a copy
        </button>
      </div>
    </div>
  )
}

export function ResizeMenu({ design, onResize, onResizeCopy, buttonClassName = "canvas-tool" }: ResizePanelProps & { buttonClassName?: string }) {
  return (
    <PopoverButton
      label="Resize"
      buttonClassName={buttonClassName}
      placement="bottom-end"
      width={330}
      panel={(close) => (
        <ResizePanel
          design={design}
          onResize={(target) => {
            close()
            onResize(target)
          }}
          onResizeCopy={(target) => {
            close()
            onResizeCopy(target)
          }}
        />
      )}
    >
      <Scaling className="h-4 w-4" aria-hidden="true" />

    </PopoverButton>
  )
}

"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Ban, Pipette } from "lucide-react"

import type { DesignDoc } from "@/lib/design/document"
import { parseColor, toHex6 } from "@/lib/design/style"
import { PALETTE_KEYS, type DesignTheme } from "@/lib/design/themes"

import { PopoverButton } from "./popover"

/**
 * The colour chooser: the design's own colours first (what is already on the
 * pages), then the theme palette, then a fixed set of defaults, then any
 * colour by hex or the system picker. Every choice is a 6-digit hex, the
 * format every export target understands.
 */

const DEFAULT_COLORS = [
  "#FFFFFF", "#F4F5F7", "#D1D5DB", "#6B7280", "#1F2430", "#000000",
  "#FF5C5C", "#FF8A3D", "#FFC53D", "#8BD450", "#2FBF71", "#1FB5A6",
  "#34C3F5", "#2F80ED", "#4F46E5", "#8B5CF6", "#D6246E", "#FF77C8",
  "#FDE2E4", "#FFF1D6", "#E4F8E8", "#DDF3FF", "#ECE7FF", "#FFE4F2",
]

/** Colours already used in a design (fills, text, outlines, backgrounds), most used first. */
export function documentColors(design: DesignDoc, limit = 12): string[] {
  const counts = new Map<string, number>()
  const add = (value: unknown) => {
    if (typeof value !== "string" || !parseColor(value) || (parseColor(value)?.a ?? 1) < 0.05) return
    const hex = toHex6(value)
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  for (const page of design.pages) {
    add(page.background)
    for (const element of page.elements) {
      const style = element.style
      add(style.color)
      add(style.fill)
      add(style.fill2)
      add(style.stroke)
      add(style.backgroundColor)
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, limit).map(([hex]) => hex)
}

function Swatch({ color, selected, onPick, label }: { color: string; selected: boolean; onPick: (color: string) => void; label?: string }) {
  return (
    <button
      type="button"
      className="relative h-7 w-7 rounded-full border border-black/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)] transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring dark:border-white/15"
      style={{ background: color }}
      title={label ? `${label} ${color}` : color}
      aria-label={label ? `${label} ${color}` : color}
      aria-pressed={selected}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onPick(color)}
    >
      {selected ? <span className="absolute inset-[-4px] rounded-full ring-2 ring-primary" aria-hidden="true" /> : null}
    </button>
  )
}

interface ColorPickerProps {
  value: string | null
  onChange: (color: string | null) => void
  theme: DesignTheme
  design: DesignDoc
  /** Offer "no colour" (transparent fill, no outline). */
  allowNone?: boolean
}

export function ColorPicker({ value, onChange, theme, design, allowNone = false }: ColorPickerProps) {
  const current = value && parseColor(value) ? toHex6(value) : null
  const [draft, setDraft] = useState(current ?? "")
  useEffect(() => setDraft(current ?? ""), [current])
  const used = useMemo(() => documentColors(design), [design])
  const themeColors = useMemo(() => [...new Set(PALETTE_KEYS.map((key) => toHex6(theme.palette[key])))], [theme])

  const commitDraft = () => {
    const text = draft.trim().startsWith("#") ? draft.trim() : `#${draft.trim()}`
    if (/^#[0-9a-f]{6}$/i.test(text) || /^#[0-9a-f]{3}$/i.test(text)) onChange(toHex6(text))
    else setDraft(current ?? "")
  }

  const eyeDropperAvailable = typeof window !== "undefined" && "EyeDropper" in window

  return (
    <div className="w-[16.5rem] space-y-3">
      {used.length ? (
        <section>
          <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">In this design</p>
          <div className="flex flex-wrap gap-2">
            {used.map((color) => (
              <Swatch key={`used-${color}`} color={color} selected={color === current} onPick={onChange} />
            ))}
          </div>
        </section>
      ) : null}
      <section>
        <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{theme.label} theme</p>
        <div className="flex flex-wrap gap-2">
          {themeColors.map((color) => (
            <Swatch key={`theme-${color}`} color={color} selected={color === current} onPick={onChange} label="Theme colour" />
          ))}
        </div>
      </section>
      <section>
        <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Default colours</p>
        <div className="grid grid-cols-6 gap-2">
          {DEFAULT_COLORS.map((color) => (
            <Swatch key={`default-${color}`} color={color} selected={color === current} onPick={onChange} />
          ))}
        </div>
      </section>
      <section className="flex items-center gap-2">
        <label className="relative inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border" title="Pick any colour" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}>
          <span className="sr-only">Pick any colour</span>
          <input type="color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={current ?? "#000000"} onChange={(event) => onChange(toHex6(event.target.value))} />
        </label>
        <input
          aria-label="Hex colour"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitDraft()
          }}
          placeholder="#2F80ED"
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 font-mono text-xs uppercase"
        />
        {eyeDropperAvailable ? (
          <button
            type="button"
            className="icon-button shrink-0"
            title="Pick a colour from the screen"
            aria-label="Pick a colour from the screen"
            onClick={async () => {
              try {
                const picker = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper()
                const result = await picker.open()
                onChange(toHex6(result.sRGBHex))
              } catch {
                // Cancelled.
              }
            }}
          >
            <Pipette className="h-4 w-4" />
          </button>
        ) : null}
        {allowNone ? (
          <button type="button" className="icon-button shrink-0" title="No colour" aria-label="No colour" aria-pressed={current === null} onClick={() => onChange(null)}>
            <Ban className="h-4 w-4" />
          </button>
        ) : null}
      </section>
    </div>
  )
}

interface ColorButtonProps extends ColorPickerProps {
  label: string
  /** How the button shows the colour: a filled dot, or a letter with a colour bar under it (text colour). */
  look?: "dot" | "text" | "outline"
  icon?: ReactNode
  buttonClassName?: string
}

/** A toolbar button showing a colour, opening the picker. */
export function ColorButton({ label, look = "dot", icon, buttonClassName = "canvas-tool !px-2", ...picker }: ColorButtonProps) {
  const color = picker.value && parseColor(picker.value) ? toHex6(picker.value) : null
  return (
    <PopoverButton label={label} buttonClassName={buttonClassName} width={290} panel={() => <ColorPicker {...picker} />}>
      {look === "text" ? (
        <span className="flex flex-col items-center leading-none" aria-hidden="true">
          <span className="text-[0.95rem] font-bold">A</span>
          <span className="mt-0.5 h-1 w-5 rounded-full border border-black/10" style={{ background: color ?? "transparent" }} />
        </span>
      ) : look === "outline" ? (
        <span className="h-5 w-5 rounded-full border-[3px] bg-transparent" style={{ borderColor: color ?? "transparent", boxShadow: color ? undefined : "inset 0 0 0 1px var(--border)" }} aria-hidden="true" />
      ) : (
        <span
          className="h-5 w-5 rounded-full border border-black/15 dark:border-white/20"
          style={{ background: color ?? "repeating-conic-gradient(#d4d4d8 0 25%, #ffffff 0 50%) 50% / 8px 8px" }}
          aria-hidden="true"
        />
      )}
      {icon}
    </PopoverButton>
  )
}

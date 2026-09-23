"use client"

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Blend,
  Bold,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Crop,
  FlipHorizontal2,
  Frame,
  Group,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Lock,
  LockOpen,
  Minus,
  Palette,
  Plus,
  Replace,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  Strikethrough,
  Trash2,
  Underline,
  Ungroup,
  WandSparkles,
} from "lucide-react"

import type { AlignMode, CanvasElement, DistributeAxis, ReorderAction } from "@/lib/studio/canvas-engine"
import { updatePage, withPageElements, pageUnit } from "@/lib/design/document"
import { growText, setElementStyle } from "@/lib/design/editing"
import { designFont, designFontStack, designFonts, nearestFontWeight, type DesignFontCategory } from "@/lib/design/fonts"
import { isStrokeOnlyShape, SHAPE_KINDS, SHAPE_LABELS, shapePath, maskPath, type ShapeKind } from "@/lib/design/shapes"
import {
  FONT_SIZE_RANGE,
  IMAGE_FILTERS,
  IMAGE_MASKS,
  imageFilterCss,
  readImageStyle,
  readShapeStyle,
  readTextStyle,
  SHADOW_KINDS,
  TEXT_EFFECTS,
  type ImageFilter,
  type ImageMask,
  type ShadowKind,
  type StrokeDash,
  type TextEffect,
} from "@/lib/design/style"
import type { ListStyle, TextAlign } from "@/lib/design/text"

import { ColorButton } from "./color-picker"
import type { DesignEditorApi, DesignPanelId } from "./editor-types"
import { PopoverButton } from "./popover"

/**
 * The bar above the page that changes with the selection, like every design
 * tool people know: type controls for text, fill and outline for shapes,
 * crop, filters and frames for pictures, and the shared arrange, transparency,
 * lock, copy and delete controls for anything. With nothing selected it holds
 * the page's own controls.
 *
 * Each control is one undo step; sliders and the size stepper coalesce, so a
 * drag along a slider is undone in one go.
 */

export interface ToolbarActions {
  editText: () => void
  crop: () => void
  replacePicture: () => void
  openPanel: (panel: DesignPanelId) => void
  duplicate: () => void
  remove: () => void
  group: () => void
  ungroup: () => void
  reorder: (action: ReorderAction) => void
  align: (mode: AlignMode) => void
  distribute: (axis: DistributeAxis) => void
  toggleLock: () => void
}

interface ContextToolbarProps {
  api: DesignEditorApi
  selection: readonly CanvasElement[]
  actions: ToolbarActions
  cropping: boolean
}

const FONT_CATEGORY_LABELS: Record<DesignFontCategory, string> = {
  sans: "Clean",
  serif: "Serif",
  display: "Display",
  handwriting: "Handwritten",
  mono: "Monospace",
}

const TEXT_EFFECT_LABELS: Record<TextEffect, string> = { none: "None", shadow: "Shadow", lift: "Lift", outline: "Outline", neon: "Neon", highlight: "Highlight" }
const SHADOW_LABELS: Record<ShadowKind, string> = { none: "None", soft: "Soft", lifted: "Lifted", glow: "Glow" }
const FILTER_LABELS: Record<ImageFilter, string> = { none: "Original", grayscale: "Mono", sepia: "Sepia", warm: "Warm", cool: "Cool", vivid: "Vivid", fade: "Faded", dark: "Moody" }
const MASK_LABELS: Record<ImageMask, string> = { none: "Square", rounded: "Rounded", circle: "Circle", blob: "Blob", heart: "Heart", star: "Star", hexagon: "Hexagon", arch: "Arch" }
const ALIGN_ORDER: readonly TextAlign[] = ["left", "center", "right", "justify"]
const LIST_ORDER: readonly ListStyle[] = ["none", "bullet", "number", "check"]

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** The step for the font size stepper: finer at small sizes. */
function sizeStep(size: number): number {
  if (size < 16) return 1
  if (size < 48) return 2
  if (size < 120) return 4
  return 8
}

function Divider() {
  return <span className="mx-0.5 hidden h-6 w-px self-center bg-border sm:block" aria-hidden="true" />
}

function ToolButton({ label, onClick, active, disabled, children, className = "" }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      className={`canvas-tool !px-2.5 ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      data-active={active ? "true" : "false"}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function RangeRow({ label, min, max, step, value, format, onChange }: { label: string; min: number; max: number; step: number; value: number; format?: (value: number) => string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-semibold">
        {label}
        <span className="tabular-nums text-muted-foreground">{format ? format(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[var(--primary)]" />
    </label>
  )
}

function ChoiceGrid<T extends string>({ label, options, value, labels, onChange, columns = 3, render }: { label: string; options: readonly T[]; value: T; labels: Record<T, string>; onChange: (value: T) => void; columns?: number; render?: (option: T) => ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange(option)}
          className={`flex flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-[0.7rem] font-semibold transition ${value === option ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent hover:text-accent-foreground"}`}
        >
          {render ? render(option) : null}
          {labels[option]}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Font family
// ---------------------------------------------------------------------------

function FontPicker({ value, onPick }: { value: string; onPick: (fontId: string) => void }) {
  const [query, setQuery] = useState("")
  const font = designFont(value)
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = designFonts.filter((candidate) => !needle || candidate.label.toLowerCase().includes(needle) || FONT_CATEGORY_LABELS[candidate.category].toLowerCase().includes(needle))
    const order: DesignFontCategory[] = ["sans", "display", "serif", "handwriting", "mono"]
    return order.map((category) => ({ category, fonts: matches.filter((candidate) => candidate.category === category) })).filter((group) => group.fonts.length)
  }, [query])
  return (
    <PopoverButton
      label={`Font: ${font.label}`}
      buttonClassName="canvas-tool !w-[9.5rem] !justify-between !px-3"
      width={260}
      panel={(close) => (
        <div className="w-[15rem]">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search fonts"
            aria-label="Search fonts"
            className="mb-2 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <div className="max-h-[22rem] overflow-y-auto pr-1">
            {groups.map((group) => (
              <div key={group.category} className="mb-2">
                <p className="px-2 pb-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{FONT_CATEGORY_LABELS[group.category]}</p>
                {group.fonts.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onPick(candidate.id)
                      close()
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[1.05rem] transition hover:bg-muted ${candidate.id === font.id ? "bg-muted font-semibold" : ""}`}
                    style={{ fontFamily: designFontStack(candidate.id) }}
                  >
                    {candidate.label}
                    {candidate.id === font.id ? <span className="font-sans text-[0.7rem] text-primary">Current</span> : null}
                  </button>
                ))}
              </div>
            ))}
            {!groups.length ? <p className="px-2 py-3 text-xs text-muted-foreground">No font matches.</p> : null}
          </div>
        </div>
      )}
    >
      <span className="truncate" style={{ fontFamily: designFontStack(font.id) }}>
        {font.label}
      </span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
    </PopoverButton>
  )
}

// ---------------------------------------------------------------------------
// Font size
// ---------------------------------------------------------------------------

function FontSizeControl({ size, onChange }: { size: number; onChange: (next: number, coalesce: boolean) => void }) {
  const [draft, setDraft] = useState(String(Math.round(size)))
  useEffect(() => setDraft(String(round1(size))), [size])
  const apply = () => {
    const value = Number(draft)
    if (Number.isFinite(value) && value > 0) onChange(Math.min(FONT_SIZE_RANGE.max, Math.max(FONT_SIZE_RANGE.min, value)), false)
    else setDraft(String(round1(size)))
  }
  return (
    <span className="inline-flex h-9 items-center overflow-hidden rounded-[10px] bg-card">
      <button type="button" className="inline-flex h-9 w-8 items-center justify-center hover:bg-accent" aria-label="Smaller text" title="Smaller text" onMouseDown={(event) => event.preventDefault()} onClick={() => onChange(Math.max(FONT_SIZE_RANGE.min, size - sizeStep(size)), true)}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        value={draft}
        inputMode="decimal"
        aria-label="Font size"
        onChange={(event) => setDraft(event.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
        onBlur={apply}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            apply()
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            const delta = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1)
            onChange(Math.min(FONT_SIZE_RANGE.max, Math.max(FONT_SIZE_RANGE.min, size + delta)), true)
          }
        }}
        className="h-9 w-12 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
      />
      <button type="button" className="inline-flex h-9 w-8 items-center justify-center hover:bg-accent" aria-label="Bigger text" title="Bigger text" onMouseDown={(event) => event.preventDefault()} onClick={() => onChange(Math.min(FONT_SIZE_RANGE.max, size + sizeStep(size)), true)}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

// ---------------------------------------------------------------------------
// The toolbar
// ---------------------------------------------------------------------------

export function ContextToolbar({ api, selection, actions, cropping }: ContextToolbarProps) {
  const unit = pageUnit(api.design)
  const page = api.design.pages[api.pageIndex]
  const ids = useMemo(() => new Set(selection.map((element) => element.id)), [selection])
  const selectionKey = useMemo(() => [...ids].sort().join(","), [ids])

  /** Change every selected element (that `filter` accepts) as one step. */
  const change = (fn: (element: CanvasElement) => CanvasElement, options: { coalesce?: string; filter?: (element: CanvasElement) => boolean } = {}) => {
    api.update(
      (design) => {
        const current = design.pages[api.pageIndex]
        if (!current) return design
        let changed = false
        const elements = current.elements.map((element) => {
          if (!ids.has(element.id) || (options.filter && !options.filter(element))) return element
          const next = fn(element)
          if (next !== element) changed = true
          return next
        })
        return changed ? withPageElements(design, api.pageIndex, elements) : design
      },
      options.coalesce ? { coalesce: `${options.coalesce}:${selectionKey}` } : undefined,
    )
  }
  const styleAll = (patch: Record<string, unknown>, coalesce?: string, filter?: (element: CanvasElement) => boolean) =>
    change((element) => growText(setElementStyle(element, patch), api.measure), { coalesce, filter })

  if (!page) return null

  // -------------------------------------------------------------------------
  // Nothing selected: the page itself
  // -------------------------------------------------------------------------
  if (!selection.length) {
    return (
      <div className="canvas-toolbar items-center" role="toolbar" aria-label="Page tools">
        <span className="inline-flex h-9 items-center rounded-[10px] bg-card px-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Page {api.pageIndex + 1}</span>
        <ColorButton
          label="Page background"
          value={page.background}
          onChange={(color) => color && api.update((design) => updatePage(design, api.pageIndex, { background: color, backgroundRole: null }))}
          theme={api.theme}
          design={api.design}
          buttonClassName="canvas-tool !px-2.5"
          icon={<span className="text-xs">Background</span>}
        />
        <ToolButton label="Themes, paper and transitions" onClick={() => actions.openPanel("styles")}>
          <Palette className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs">Styles</span>
        </ToolButton>
        <ToolButton label="Magic layout: arrange this page" onClick={() => actions.openPanel("magic")}>
          <WandSparkles className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs">Magic layout</span>
        </ToolButton>
        <span className="hidden items-center px-2 text-xs text-muted-foreground xl:inline-flex">Click anything to change it · double-click text to type · drag from the left panels</span>
      </div>
    )
  }

  const texts = selection.filter((element) => element.type === "text")
  const shapes = selection.filter((element) => element.type === "shape")
  const images = selection.filter((element) => element.type === "image")
  const labelled = shapes.filter((element) => element.content.trim())
  const typeable = [...texts, ...labelled]
  const isTypeable = (element: CanvasElement) => element.type === "text" || (element.type === "shape" && Boolean(element.content.trim()))
  const locked = selection.every((element) => element.locked)
  const single = selection.length === 1 ? selection[0] : null
  const grouped = selection.some((element) => element.groupId)
  const clusters = new Set(selection.map((element) => element.groupId ?? element.id)).size

  // Values shown are the first element's of each kind.
  const firstText = typeable[0] ?? null
  const textStyle = firstText ? (firstText.type === "text" ? readTextStyle(firstText) : null) : null
  const labelStyle = firstText && firstText.type === "shape" ? readShapeStyle(firstText).label : null
  const typeFont = textStyle?.font ?? labelStyle?.font ?? "sans"
  const typeSize = textStyle?.size ?? labelStyle?.size ?? 32
  const typeWeight = textStyle?.weight ?? labelStyle?.weight ?? 400
  const typeColor = textStyle?.color ?? labelStyle?.color ?? "#1F2430"
  const italic = firstText ? firstText.style.italic === true : false

  const firstShape = shapes[0] ?? null
  const shapeStyle = firstShape ? readShapeStyle(firstShape) : null
  const firstImage = images[0] ?? null
  const imageStyle = firstImage ? readImageStyle(firstImage) : null
  const opacity = single ? (single.type === "text" ? readTextStyle(single).opacity : single.type === "image" ? readImageStyle(single).opacity : readShapeStyle(single).opacity) : 1
  const boxShadow = firstShape ? readShapeStyle(firstShape).shadow : firstImage ? readImageStyle(firstImage).shadow : "none"

  const setSize = (next: number, coalesce: boolean) => {
    const ratio = next / Math.max(1, typeSize)
    change(
      (element) => {
        const current = element.type === "text" ? readTextStyle(element).size : readShapeStyle(element).label.size
        const size = typeable.length > 1 ? Math.min(FONT_SIZE_RANGE.max, Math.max(FONT_SIZE_RANGE.min, round1(current * ratio))) : round1(next)
        return growText(setElementStyle(element, { fontSize: size }), api.measure)
      },
      { coalesce: coalesce ? "font-size" : undefined, filter: isTypeable },
    )
  }

  return (
    <div className="canvas-toolbar items-center" role="toolbar" aria-label="Selection tools">
      {typeable.length ? (
        <>
          <FontPicker
            value={typeFont}
            onPick={(fontId) =>
              change((element) => {
                const weight = element.type === "text" ? readTextStyle(element).weight : readShapeStyle(element).label.weight
                return growText(setElementStyle(element, { fontFamily: fontId, fontWeight: nearestFontWeight(fontId, weight) }), api.measure)
              }, { filter: isTypeable })
            }
          />
          <FontSizeControl size={typeSize} onChange={setSize} />
          <ColorButton label="Text colour" look="text" value={typeColor} onChange={(color) => color && styleAll({ color }, undefined, isTypeable)} theme={api.theme} design={api.design} />
          <ToolButton
            label="Bold (Ctrl+B)"
            active={typeWeight >= 600}
            onClick={() => change((element) => growText(setElementStyle(element, { fontWeight: nearestFontWeight(element.style.fontFamily, typeWeight >= 600 ? 400 : 700) }), api.measure), { filter: isTypeable })}
          >
            <Bold className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Italic (Ctrl+I)" active={italic} onClick={() => styleAll({ italic: !italic }, undefined, isTypeable)}>
            <Italic className="h-4 w-4" />
          </ToolButton>
          {textStyle ? (
            <>
              <ToolButton label="Underline (Ctrl+U)" active={textStyle.underline} onClick={() => styleAll({ underline: !textStyle.underline }, undefined, (element) => element.type === "text")}>
                <Underline className="h-4 w-4" />
              </ToolButton>
              <ToolButton label="Strikethrough" active={textStyle.strike} onClick={() => styleAll({ strike: !textStyle.strike }, undefined, (element) => element.type === "text")}>
                <Strikethrough className="h-4 w-4" />
              </ToolButton>
              <ToolButton
                label={`Alignment: ${textStyle.align}`}
                onClick={() => styleAll({ textAlign: ALIGN_ORDER[(ALIGN_ORDER.indexOf(textStyle.align) + 1) % ALIGN_ORDER.length] }, undefined, (element) => element.type === "text")}
              >
                {textStyle.align === "center" ? <AlignCenter className="h-4 w-4" /> : textStyle.align === "right" ? <AlignRight className="h-4 w-4" /> : textStyle.align === "justify" ? <AlignJustify className="h-4 w-4" /> : <AlignLeft className="h-4 w-4" />}
              </ToolButton>
              <ToolButton
                label={`List: ${textStyle.list === "none" ? "off" : textStyle.list}`}
                active={textStyle.list !== "none"}
                onClick={() => styleAll({ list: LIST_ORDER[(LIST_ORDER.indexOf(textStyle.list) + 1) % LIST_ORDER.length] }, undefined, (element) => element.type === "text")}
              >
                {textStyle.list === "number" ? <ListOrdered className="h-4 w-4" /> : textStyle.list === "check" ? <ListChecks className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </ToolButton>
              <ToolButton label={textStyle.uppercase ? "Normal case" : "Uppercase"} active={textStyle.uppercase} onClick={() => styleAll({ uppercase: !textStyle.uppercase }, undefined, (element) => element.type === "text")}>
                <span className="text-[0.8rem] font-bold leading-none">aA</span>
              </ToolButton>
              <PopoverButton label="Spacing" buttonClassName="canvas-tool !px-2.5" width={260} panel={() => (
                <div className="w-[15rem] space-y-3">
                  <RangeRow label="Letter spacing" min={-0.1} max={0.6} step={0.01} value={textStyle.letterSpacing} format={(value) => `${Math.round(value * 1000)}`} onChange={(value) => styleAll({ letterSpacing: value }, "letter-spacing", (element) => element.type === "text")} />
                  <RangeRow label="Line height" min={0.8} max={2.6} step={0.05} value={textStyle.lineHeight} format={(value) => value.toFixed(2)} onChange={(value) => styleAll({ lineHeight: value }, "line-height", (element) => element.type === "text")} />
                  <RangeRow label="Paragraph spacing" min={0} max={2} step={0.05} value={textStyle.paragraphSpacing ?? 0} format={(value) => value.toFixed(2)} onChange={(value) => styleAll({ paragraphSpacing: value }, "paragraph-spacing", (element) => element.type === "text")} />
                  <div>
                    <p className="mb-1 text-xs font-semibold">Vertical position</p>
                    <ChoiceGrid
                      label="Vertical position"
                      options={["top", "middle", "bottom"] as const}
                      value={textStyle.verticalAlign}
                      labels={{ top: "Top", middle: "Middle", bottom: "Bottom" }}
                      onChange={(verticalAlign) => styleAll({ verticalAlign }, undefined, (element) => element.type === "text")}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold">Box size</p>
                    <ChoiceGrid
                      label="Box size"
                      options={["grow", "shrink", "none"] as const}
                      value={textStyle.fit}
                      labels={{ grow: "Fit text", shrink: "Shrink text", none: "Fixed" }}
                      onChange={(fit) => styleAll({ fit }, undefined, (element) => element.type === "text")}
                    />
                  </div>
                </div>
              )}>
                <SlidersHorizontal className="h-4 w-4" />
              </PopoverButton>
              <PopoverButton label="Text effects" buttonClassName="canvas-tool !px-2.5" width={280} active={textStyle.effect !== "none" || Boolean(textStyle.background)} panel={() => (
                <div className="w-[16rem] space-y-3">
                  <ChoiceGrid
                    label="Effect"
                    options={TEXT_EFFECTS}
                    value={textStyle.effect}
                    labels={TEXT_EFFECT_LABELS}
                    onChange={(effect) => styleAll({ effect }, undefined, (element) => element.type === "text")}
                    render={(effect) => <EffectSample effect={effect} />}
                  />
                  {textStyle.effect !== "none" && textStyle.effect !== "lift" ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">Effect colour</span>
                      <ColorButton label="Effect colour" value={textStyle.effectColor} onChange={(color) => color && styleAll({ effectColor: color }, undefined, (element) => element.type === "text")} theme={api.theme} design={api.design} />
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">Box background</span>
                    <ColorButton
                      label="Text box background"
                      value={textStyle.background}
                      allowNone
                      onChange={(color) => styleAll(color ? { backgroundColor: color, padding: textStyle.padding || Math.round(16 * unit), borderRadius: textStyle.radius || Math.round(12 * unit) } : { backgroundColor: null }, undefined, (element) => element.type === "text")}
                      theme={api.theme}
                      design={api.design}
                    />
                  </div>
                  {textStyle.background ? (
                    <RangeRow label="Box padding" min={0} max={Math.round(120 * unit)} step={1} value={textStyle.padding} onChange={(value) => styleAll({ padding: value }, "padding", (element) => element.type === "text")} />
                  ) : null}
                </div>
              )}>
                <Sparkles className="h-4 w-4" />
              </PopoverButton>
            </>
          ) : null}
          <Divider />
        </>
      ) : null}

      {shapes.length && shapeStyle ? (
        <>
          {!isStrokeOnlyShape(shapeStyle.shape) ? (
            <ColorButton
              label="Fill colour"
              value={shapeStyle.fill}
              allowNone
              onChange={(color) => styleAll(color ? { fill: color, fillRole: null } : { fill: "transparent", fillRole: null, fill2: null }, undefined, (element) => element.type === "shape")}
              theme={api.theme}
              design={api.design}
            />
          ) : null}
          {!isStrokeOnlyShape(shapeStyle.shape) ? (
            <PopoverButton label="Gradient" buttonClassName="canvas-tool !px-2.5" width={280} active={Boolean(shapeStyle.fill2)} panel={() => (
              <div className="w-[15rem] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Second colour</span>
                  <ColorButton
                    label="Gradient colour"
                    value={shapeStyle.fill2}
                    allowNone
                    onChange={(color) => styleAll({ fill2: color }, undefined, (element) => element.type === "shape")}
                    theme={api.theme}
                    design={api.design}
                  />
                </div>
                {shapeStyle.fill2 ? <RangeRow label="Angle" min={0} max={360} step={5} value={((shapeStyle.gradientAngle % 360) + 360) % 360} format={(value) => `${value}°`} onChange={(value) => styleAll({ gradientAngle: value }, "gradient-angle", (element) => element.type === "shape")} /> : <p className="text-xs text-muted-foreground">Pick a second colour to blend the fill into it.</p>}
              </div>
            )}>
              <Blend className="h-4 w-4" />
            </PopoverButton>
          ) : null}
          <PopoverButton label="Outline" buttonClassName="canvas-tool !px-2.5" width={280} active={Boolean(shapeStyle.stroke)} panel={() => (
            <div className="w-[15rem] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">Outline colour</span>
                <ColorButton
                  label="Outline colour"
                  look="outline"
                  value={shapeStyle.stroke}
                  allowNone={!isStrokeOnlyShape(shapeStyle.shape)}
                  onChange={(color) => styleAll(color ? { stroke: color, strokeRole: null, strokeWidth: shapeStyle.strokeWidth || Math.max(1, Math.round(6 * unit)) } : { stroke: null, strokeWidth: null }, undefined, (element) => element.type === "shape")}
                  theme={api.theme}
                  design={api.design}
                />
              </div>
              {shapeStyle.stroke ? (
                <>
                  <RangeRow label="Thickness" min={1} max={Math.max(12, Math.round(48 * unit))} step={1} value={Math.round(shapeStyle.strokeWidth)} onChange={(value) => styleAll({ strokeWidth: value }, "stroke-width", (element) => element.type === "shape")} />
                  <ChoiceGrid label="Line style" options={["solid", "dashed", "dotted"] as readonly StrokeDash[]} value={shapeStyle.dash} labels={{ solid: "Solid", dashed: "Dashed", dotted: "Dotted" }} onChange={(dash) => styleAll({ dash }, undefined, (element) => element.type === "shape")} />
                </>
              ) : null}
            </div>
          )}>
            <SquareDashed className="h-4 w-4" />
          </PopoverButton>
          {shapeStyle.shape === "rounded" || shapeStyle.shape === "rect" ? (
            <PopoverButton label="Corners" buttonClassName="canvas-tool !px-2.5" width={260} panel={() => (
              <div className="w-[14rem]">
                <RangeRow
                  label="Corner rounding"
                  min={0}
                  max={Math.round(Math.min(firstShape?.width ?? 200, firstShape?.height ?? 200) / 2)}
                  step={1}
                  value={Math.round(shapeStyle.radius)}
                  onChange={(value) => styleAll({ borderRadius: value, shape: value > 0 ? "rounded" : "rect", radiusRole: null }, "corner-radius", (element) => element.type === "shape" && ["rect", "rounded"].includes(readShapeStyle(element).shape))}
                />
              </div>
            )}>
              <span className="inline-block h-4 w-4 rounded-[5px] border-2 border-current" aria-hidden="true" />
            </PopoverButton>
          ) : null}
          <PopoverButton label="Change shape" buttonClassName="canvas-tool !px-2.5" width={300} panel={(close) => (
            <div className="grid w-[16.5rem] grid-cols-5 gap-1.5">
              {SHAPE_KINDS.filter((kind) => isStrokeOnlyShape(kind) === isStrokeOnlyShape(shapeStyle.shape)).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  title={SHAPE_LABELS[kind]}
                  aria-label={SHAPE_LABELS[kind]}
                  aria-pressed={kind === shapeStyle.shape}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    styleAll({ shape: kind }, undefined, (element) => element.type === "shape")
                    close()
                  }}
                  className={`flex aspect-square items-center justify-center rounded-lg transition ${kind === shapeStyle.shape ? "bg-primary/15 ring-2 ring-primary" : "bg-muted hover:bg-accent"}`}
                >
                  <MiniShape kind={kind} />
                </button>
              ))}
            </div>
          )}>
            <Shapes className="h-4 w-4" />
          </PopoverButton>
          <Divider />
        </>
      ) : null}

      {images.length && imageStyle ? (
        <>
          {single?.type === "image" && single.content ? (
            <ToolButton label="Crop (or double-click the picture)" active={cropping} onClick={actions.crop}>
              <Crop className="h-4 w-4" />
              <span className="text-xs">{cropping ? "Done" : "Crop"}</span>
            </ToolButton>
          ) : null}
          {single?.type === "image" ? (
            <ToolButton label={single.content ? "Replace picture" : "Add a picture to this frame"} onClick={actions.replacePicture}>
              <Replace className="h-4 w-4" />
              <span className="text-xs">{single.content ? "Replace" : "Add picture"}</span>
            </ToolButton>
          ) : null}
          <PopoverButton label="Filters" buttonClassName="canvas-tool !px-2.5" width={300} active={imageStyle.filter !== "none"} panel={() => (
            <ChoiceGrid
              label="Filter"
              options={IMAGE_FILTERS}
              value={imageStyle.filter}
              labels={FILTER_LABELS}
              columns={4}
              onChange={(filter) => styleAll({ filter }, undefined, (element) => element.type === "image")}
              render={(filter) => <FilterSample src={firstImage?.content ?? ""} filter={filter} />}
            />
          )}>
            <Palette className="h-4 w-4" />
            <span className="text-xs">Filter</span>
          </PopoverButton>
          <PopoverButton label="Frame shape" buttonClassName="canvas-tool !px-2.5" width={300} active={imageStyle.mask !== "none"} panel={() => (
            <ChoiceGrid
              label="Frame shape"
              options={IMAGE_MASKS}
              value={imageStyle.mask}
              labels={MASK_LABELS}
              columns={4}
              onChange={(mask) => styleAll({ mask, ...(mask === "rounded" && !imageStyle.radius ? { borderRadius: Math.round(36 * unit) } : {}) }, undefined, (element) => element.type === "image")}
              render={(mask) => <MiniMask mask={mask} />}
            />
          )}>
            <Frame className="h-4 w-4" />
          </PopoverButton>
          <ToolButton label="Flip horizontally" active={imageStyle.flipX} onClick={() => styleAll({ flipX: !imageStyle.flipX }, undefined, (element) => element.type === "image")}>
            <FlipHorizontal2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label={imageStyle.fit === "cover" ? "Show the whole picture" : "Fill the frame"} onClick={() => styleAll({ fit: imageStyle.fit === "cover" ? "contain" : "cover" }, undefined, (element) => element.type === "image")}>
            <span className="text-xs">{imageStyle.fit === "cover" ? "Fill" : "Fit"}</span>
          </ToolButton>
          <Divider />
        </>
      ) : null}

      {shapes.length || images.length ? (
        <PopoverButton label="Shadow" buttonClassName="canvas-tool !px-2.5" width={280} active={boxShadow !== "none"} panel={() => (
          <ChoiceGrid label="Shadow" options={SHADOW_KINDS} value={boxShadow} labels={SHADOW_LABELS} columns={4} onChange={(shadow) => styleAll({ shadow }, undefined, (element) => element.type !== "text")} />
        )}>
          <span className="inline-block h-3.5 w-3.5 rounded-[4px] bg-current opacity-80 shadow-[2px_2px_0_0_var(--muted-foreground)]" aria-hidden="true" />
        </PopoverButton>
      ) : null}

      <PopoverButton label="Transparency" buttonClassName="canvas-tool !px-2.5" width={260} active={opacity < 1} panel={() => (
        <div className="w-[14rem]">
          <RangeRow label="Transparency" min={0} max={98} step={1} value={Math.round((1 - opacity) * 100)} format={(value) => `${value}%`} onChange={(value) => styleAll({ opacity: Math.round((1 - value / 100) * 100) / 100 }, "opacity")} />
        </div>
      )}>
        <span className="inline-block h-4 w-4 rounded-[4px] border border-current" style={{ background: "repeating-conic-gradient(currentColor 0 25%, transparent 0 50%) 50% / 6px 6px", opacity: 0.8 }} aria-hidden="true" />
      </PopoverButton>

      <PopoverButton label="Position" buttonClassName="canvas-tool !px-2.5" width={290} panel={(close) => (
        <div className="w-[16rem] space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold">Layer</p>
            <div className="grid grid-cols-2 gap-1.5">
              <PanelAction onClick={() => actions.reorder("forward")} icon={<ArrowUpToLine className="h-3.5 w-3.5" />}>Forward</PanelAction>
              <PanelAction onClick={() => actions.reorder("backward")} icon={<ArrowDownToLine className="h-3.5 w-3.5" />}>Backward</PanelAction>
              <PanelAction onClick={() => actions.reorder("front")} icon={<ChevronsUp className="h-3.5 w-3.5" />}>To front</PanelAction>
              <PanelAction onClick={() => actions.reorder("back")} icon={<ChevronsDown className="h-3.5 w-3.5" />}>To back</PanelAction>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold">{clusters > 1 ? "Align to each other" : "Align to page"}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(["left", "center", "right", "top", "middle", "bottom"] as const).map((mode) => (
                <PanelAction key={mode} onClick={() => actions.align(mode)}>
                  {mode[0].toUpperCase() + mode.slice(1)}
                </PanelAction>
              ))}
            </div>
          </div>
          {clusters >= 3 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold">Space evenly</p>
              <div className="grid grid-cols-2 gap-1.5">
                <PanelAction onClick={() => actions.distribute("horizontal")} icon={<AlignHorizontalDistributeCenter className="h-3.5 w-3.5" />}>Across</PanelAction>
                <PanelAction onClick={() => actions.distribute("vertical")} icon={<AlignVerticalDistributeCenter className="h-3.5 w-3.5" />}>Down</PanelAction>
              </div>
            </div>
          ) : null}
          <button type="button" className="w-full rounded-lg py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted" onClick={() => {
            actions.openPanel("layers")
            close()
          }}>
            Open the layers list
          </button>
        </div>
      )}>
        <span className="text-xs">Position</span>
      </PopoverButton>

      {clusters > 1 ? (
        <ToolButton label="Group (Ctrl+G)" onClick={actions.group}>
          <Group className="h-4 w-4" />
        </ToolButton>
      ) : grouped ? (
        <ToolButton label="Ungroup (Ctrl+Shift+G)" onClick={actions.ungroup}>
          <Ungroup className="h-4 w-4" />
        </ToolButton>
      ) : null}
      <ToolButton label={locked ? "Unlock" : "Lock"} active={locked} onClick={actions.toggleLock}>
        {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
      </ToolButton>
      <ToolButton label="Duplicate (Ctrl+D)" onClick={actions.duplicate}>
        <Copy className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Delete (Del)" onClick={actions.remove}>
        <Trash2 className="h-4 w-4" />
      </ToolButton>
      {single?.type === "text" ? (
        <ToolButton label="Edit text (Enter)" onClick={actions.editText}>
          <span className="text-xs">Edit text</span>
        </ToolButton>
      ) : null}
    </div>
  )
}

function PanelAction({ onClick, icon, children }: { onClick: () => void; icon?: ReactNode; children: ReactNode }) {
  return (
    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClick} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-muted px-2 py-1.5 text-xs font-semibold transition hover:bg-accent hover:text-accent-foreground">
      {icon}
      {children}
    </button>
  )
}

function MiniShape({ kind }: { kind: ShapeKind }) {
  const stroke = isStrokeOnlyShape(kind)
  const width = kind === "arrow" || kind === "chevron" || kind === "wave" || kind === "pill" || kind === "speech" ? 26 : 20
  const height = stroke ? 3 : 20
  return (
    <svg width={28} height={28} viewBox={`${-(28 - width) / 2} ${-(28 - height) / 2} 28 28`} aria-hidden="true">
      {stroke ? <path d={shapePath(kind, width, height)} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" /> : <path d={shapePath(kind, width, height)} fill="currentColor" opacity={0.85} />}
    </svg>
  )
}

function MiniMask({ mask }: { mask: ImageMask }) {
  const path = maskPath(mask, 22, mask === "arch" ? 26 : 22, mask === "rounded" ? 5 : 0) ?? shapePath("rect", 22, 22)
  return (
    <svg width={28} height={28} viewBox={`-3 ${mask === "arch" ? -1 : -3} 28 28`} aria-hidden="true">
      <path d={path} fill="currentColor" opacity={0.7} />
    </svg>
  )
}

function EffectSample({ effect }: { effect: TextEffect }) {
  const style: Record<TextEffect, CSSProperties> = {
    none: {},
    shadow: { textShadow: "2px 2px 0 rgba(0,0,0,0.35)" },
    lift: { textShadow: "0 4px 8px rgba(0,0,0,0.35)" },
    outline: { color: "transparent", WebkitTextStroke: "1px currentColor" },
    neon: { textShadow: "0 0 6px #5CC8FF, 0 0 12px #5CC8FF" },
    highlight: { background: "#FFE066", color: "#111", padding: "0 3px", borderRadius: 3 },
  }
  return (
    <span className="text-lg font-black leading-none" style={style[effect]} aria-hidden="true">
      Ag
    </span>
  )
}

function FilterSample({ src, filter }: { src: string; filter: ImageFilter }) {
  if (!src) return <span className="h-9 w-9 rounded-md bg-gradient-to-br from-sky-300 to-rose-300" style={{ filter: imageFilterCss(filter) || undefined }} aria-hidden="true" />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="h-9 w-9 rounded-md object-cover" style={{ filter: imageFilterCss(filter) || undefined }} draggable={false} />
  )
}

import { Fragment, memo, type CSSProperties, type ReactNode } from "react"
import type { CanvasElement } from "@/lib/studio/canvas-engine"
import { safeColor, sanitizeImageUrl } from "@/lib/studio/canvas-styles"
import type { DesignPage } from "@/lib/design/document"
import { designFontStack } from "@/lib/design/fonts"
import { dashArray, embedLabel, patternInk, patternRuleWidth, textEffectSpec } from "@/lib/design/paint"
import { isStrokeOnlyShape, maskPath, patternPaths, shapePath, type PagePattern } from "@/lib/design/shapes"
import { imageFilterCss, readImageStyle, readShapeStyle, readTextStyle, shadowSpec, type DesignBoxStyle, type TextEffect } from "@/lib/design/style"
import { layoutText, type MeasureText, type TextAlign, type TextLayoutInput } from "@/lib/design/text"
import { designTheme } from "@/lib/design/themes"

/**
 * Draws a design page as DOM: the editor's stage, the page thumbnails, the
 * present mode and the public share page.
 *
 * It mirrors `lib/design/raster.ts` (the PNG/PDF export) decision for decision:
 * the same style readers, the same `layoutText` line breaks and positions, the
 * same baseline rule (CSS centres ascent+descent in the line box, the canvas
 * does it by hand), the same highlight band, underline offsets, gradient
 * angle, picture crop and mask outline. When one changes, change the other.
 *
 * No hooks and no browser APIs, so a server component can render it; the text
 * measurer comes in as a prop (`useDesignMeasure` on the client).
 * No SVG ids either: several pages and thumbnails share one document.
 */

export interface DesignPageViewProps {
  width: number
  height: number
  theme: string
  page: DesignPage
  measure: MeasureText
  /** The text element being edited in place: its lines are hidden under the editor's textarea. */
  editingId?: string | null
  /** Editor hints: an icon in empty picture frames, "Add text" in empty text boxes. */
  placeholders?: boolean
  className?: string
  style?: CSSProperties
}

/** A page at design size (1 CSS px per design px); scale it with a transform. */
export const DesignPageView = memo(function DesignPageView({ width, height, theme, page, measure, editingId = null, placeholders = false, className, style }: DesignPageViewProps) {
  const unit = Math.min(width, height) / 1080
  return (
    <div className={className} style={{ position: "relative", width, height, overflow: "hidden", background: safeColor(page.background) ?? "#FFFFFF", ...style }}>
      <PatternView pattern={page.pattern} width={width} height={height} background={page.background} accent={designTheme(theme).palette.accent} />
      {page.elements.map((element) => (
        <DesignElementView key={element.id} element={element} unit={unit} measure={measure} editing={element.id === editingId} placeholders={placeholders} />
      ))}
    </div>
  )
})

export interface DesignThumbnailProps extends Omit<DesignPageViewProps, "editingId" | "placeholders" | "className" | "style"> {
  /** Displayed width in CSS px; the height follows the page's aspect ratio. */
  displayWidth: number
  className?: string
}

/** A page scaled down to `displayWidth` (page strip, picker cards, present mode). */
export function DesignThumbnail({ displayWidth, className, ...page }: DesignThumbnailProps) {
  const scale = displayWidth / Math.max(1, page.width)
  return (
    <div className={className} style={{ position: "relative", width: displayWidth, height: Math.round(page.height * scale * 100) / 100, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: page.width, height: page.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <DesignPageView {...page} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page pattern
// ---------------------------------------------------------------------------

const patternCache = new Map<string, ReturnType<typeof patternPaths>>()

function cachedPattern(pattern: PagePattern, width: number, height: number) {
  const key = `${pattern}|${width}|${height}`
  let paths = patternCache.get(key)
  if (!paths) {
    paths = patternPaths(pattern, width, height)
    if (patternCache.size > 24) patternCache.clear()
    patternCache.set(key, paths)
  }
  return paths
}

function PatternView({ pattern, width, height, background, accent }: { pattern: PagePattern; width: number; height: number; background: string; accent: string }) {
  if (pattern === "none") return null
  const paths = cachedPattern(pattern, width, height)
  const ink = patternInk(background, accent)
  const rule = patternRuleWidth(width, height)
  return (
    <svg aria-hidden="true" width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", left: 0, top: 0 }}>
      {paths.dots ? <path d={paths.rules} fill={ink.dot} /> : paths.rules ? <path d={paths.rules} fill="none" stroke={ink.rule} strokeWidth={rule} /> : null}
      {paths.margin ? <path d={paths.margin} fill="none" stroke={ink.margin} strokeWidth={rule * 1.4} /> : null}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

interface ElementViewProps {
  element: CanvasElement
  unit: number
  measure: MeasureText
  editing: boolean
  placeholders: boolean
}

/** One element in page coordinates. Memoised: an edit re-renders only what it touched. */
export const DesignElementView = memo(function DesignElementView({ element, unit, measure, editing, placeholders }: ElementViewProps) {
  if (element.hidden) return null
  const raw = element.style.opacity
  const opacity = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0.02, Math.min(1, raw)) : 1
  let body: ReactNode
  if (element.type === "text") body = <TextElementView element={element} unit={unit} measure={measure} editing={editing} placeholders={placeholders} />
  else if (element.type === "shape") body = <ShapeElementView element={element} unit={unit} measure={measure} editing={editing} />
  else if (element.type === "image") body = <ImageElementView element={element} unit={unit} placeholders={placeholders} />
  else body = <EmbedElementView element={element} measure={measure} />
  return (
    <div
      data-design-element={element.id}
      style={{
        position: "absolute",
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        opacity: opacity < 1 ? opacity : undefined,
      }}
    >
      {body}
    </div>
  )
})

const layer: CSSProperties = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" }

function cssShadow(shadow: { x: number; y: number; blur: number; color: string } | null): string | undefined {
  return shadow ? `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color}` : undefined
}

function StrokeView({ d, width, height, stroke, strokeWidth, dash, join = "miter" }: { d: string; width: number; height: number; stroke: string; strokeWidth: number; dash: DesignBoxStyle["dash"]; join?: "miter" | "round" }) {
  const dashes = dashArray(dash, strokeWidth)
  return (
    <svg aria-hidden="true" width={Math.max(1, width)} height={Math.max(1, height)} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={{ ...layer, overflow: "visible" }}>
      <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dashes.length ? dashes.join(" ") : undefined} strokeLinecap={dash === "dotted" ? "round" : "butt"} strokeLinejoin={join} />
    </svg>
  )
}

/** A text box's own fill and outline (mirrors raster `drawBox`). */
function BoxView({ element, box, unit }: { element: CanvasElement; box: DesignBoxStyle; unit: number }) {
  const hasStroke = Boolean(box.stroke && box.strokeWidth > 0)
  if (!box.background && !hasStroke) return null
  const radius = Math.max(0, Math.min(box.radius, element.width / 2, element.height / 2))
  return (
    <>
      {box.background ? <div style={{ ...layer, background: box.background, borderRadius: radius || undefined, boxShadow: cssShadow(shadowSpec(box.shadow, unit)) }} /> : null}
      {hasStroke ? <StrokeView d={shapePath(box.radius > 0 ? "rounded" : "rect", element.width, element.height, { radius: box.radius })} width={element.width} height={element.height} stroke={box.stroke as string} strokeWidth={box.strokeWidth} dash={box.dash} /> : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

interface TextPaint {
  color: string
  align: TextAlign
  underline: boolean
  strike: boolean
  effect: TextEffect
  effectColor: string
}

const OUTLINE_STEPS = 16

/**
 * An outline as a ring of hard shadows under the fill: the union of the copies
 * is the round-joined stroke the canvas draws (`-webkit-text-stroke` would draw
 * mitred spikes on sharp letters).
 */
function outlineShadow(width: number, color: string): string {
  const parts: string[] = []
  for (let step = 0; step < OUTLINE_STEPS; step += 1) {
    const angle = (step / OUTLINE_STEPS) * Math.PI * 2
    parts.push(`${Math.round(Math.cos(angle) * width * 100) / 100}px ${Math.round(Math.sin(angle) * width * 100) / 100}px 0 ${color}`)
  }
  return parts.join(", ")
}

/** Laid-out lines inside a box (text elements, shape labels, embed cards). */
export function TextLines({ content, width, height, input, paint, measure, hidden = false }: { content: string; width: number; height: number; input: TextLayoutInput; paint: TextPaint; measure: MeasureText; hidden?: boolean }) {
  if (hidden) return null
  const layout = layoutText(content, { width, height }, input, measure)
  const effect = textEffectSpec(paint.effect, layout.size, paint.effectColor)
  const padding = Math.max(0, input.padding)
  const innerWidth = Math.max(1, width - padding * 2)
  const textLeft = padding + layout.markerWidth
  const textWidth = Math.max(1, innerWidth - layout.markerWidth)
  const spacing = input.letterSpacing * layout.size
  const thickness = Math.max(1, layout.size * 0.06)
  const font: CSSProperties = {
    position: "absolute",
    height: layout.lineHeight,
    fontFamily: designFontStack(input.font),
    fontSize: layout.size,
    fontWeight: input.weight,
    fontStyle: input.italic ? "italic" : "normal",
    lineHeight: `${layout.lineHeight}px`,
    whiteSpace: "pre",
  }
  const textShadow = effect.outline
    ? outlineShadow(effect.outline.width, effect.outline.color)
    : effect.shadows.length
      ? effect.shadows.map((shadow) => `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color}`).join(", ")
      : undefined

  return (
    <div style={{ ...layer, color: paint.color }}>
      {layout.lines.map((line, index) => {
        const top = padding + layout.offsetY + line.y
        const justify = paint.align === "justify" && !line.last && line.text.includes(" ")
        const runWidth = justify ? textWidth : line.width
        let x = textLeft
        if (paint.align === "center") x = textLeft + (textWidth - line.width) / 2
        else if (paint.align === "right") x = textLeft + textWidth - line.width
        return (
          <Fragment key={index}>
            {effect.highlight && line.text ? (
              <div style={{ position: "absolute", left: x - layout.size * 0.15, top: top + layout.lineHeight * 0.1, width: runWidth + layout.size * 0.3, height: layout.lineHeight * 0.8, background: effect.highlight }} />
            ) : null}
            {line.marker ? <div style={{ ...font, left: padding, top }}>{line.marker}</div> : null}
            <div
              style={{
                ...font,
                left: x,
                top,
                letterSpacing: spacing ? `${spacing}px` : undefined,
                textShadow,
                width: justify ? textWidth : undefined,
                textAlign: justify ? "justify" : undefined,
                textAlignLast: justify ? "justify" : undefined,
              }}
            >
              {(paint.underline || paint.strike) && line.text ? (
                // A zero-size inline block sits on the baseline, so the rules
                // hang off it at the same offsets the canvas uses.
                <span style={{ display: "inline-block", position: "relative", width: 0, height: 0, verticalAlign: "baseline" }}>
                  {paint.underline ? <span style={{ position: "absolute", left: 0, top: layout.size * 0.1, width: runWidth, height: thickness, background: paint.color }} /> : null}
                  {paint.strike ? <span style={{ position: "absolute", left: 0, top: -layout.size * 0.28, width: runWidth, height: thickness, background: paint.color }} /> : null}
                </span>
              ) : null}
              {line.text}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

function TextElementView({ element, unit, measure, editing, placeholders }: { element: CanvasElement; unit: number; measure: MeasureText; editing: boolean; placeholders: boolean }) {
  const style = readTextStyle(element)
  const empty = !element.content.trim()
  const paint: TextPaint = { color: style.color, align: style.align, underline: style.underline, strike: style.strike, effect: style.effect, effectColor: style.effectColor }
  return (
    <>
      <BoxView element={element} box={style} unit={unit} />
      {empty && placeholders && !editing ? (
        <div style={{ ...layer, opacity: 0.4 }}>
          <TextLines content="Add text" width={element.width} height={element.height} input={{ ...style, list: "none" }} paint={{ ...paint, effect: "none" }} measure={measure} />
        </div>
      ) : (
        <TextLines content={element.content} width={element.width} height={element.height} input={style} paint={paint} measure={measure} hidden={editing} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Shapes, pictures, embeds
// ---------------------------------------------------------------------------

/** How a shape's label is laid out (the editor's in-place textarea matches it). */
export function shapeLabelInput(element: CanvasElement): TextLayoutInput {
  const label = readShapeStyle(element).label
  return { font: label.font, size: label.size, weight: label.weight, italic: false, letterSpacing: 0, lineHeight: 1.2, uppercase: false, list: "none", verticalAlign: "middle", fit: "shrink", padding: Math.min(element.width, element.height) * 0.08 }
}

function ShapeElementView({ element, unit, measure, editing }: { element: CanvasElement; unit: number; measure: MeasureText; editing: boolean }) {
  const style = readShapeStyle(element)
  const hasRadius = typeof element.style.borderRadius === "number"
  const d = shapePath(style.shape, element.width, element.height, { radius: hasRadius ? style.radius : undefined, seed: style.seed })
  const w = Math.max(1, element.width)
  const h = Math.max(1, element.height)
  let body: ReactNode = null
  if (isStrokeOnlyShape(style.shape)) {
    const lineWidth = style.strokeWidth || Math.max(2, 4 * unit)
    const dashes = dashArray(style.dash, lineWidth)
    body = (
      <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ ...layer, overflow: "visible" }}>
        <path d={d} fill="none" stroke={style.stroke ?? style.fill ?? "#1F2430"} strokeWidth={lineWidth} strokeLinecap="round" strokeDasharray={dashes.length ? dashes.join(" ") : undefined} />
      </svg>
    )
  } else {
    const shadow = style.fill ? shadowSpec(style.shadow, unit, style.fill) : null
    const filter = shadow ? `drop-shadow(${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color})` : undefined
    body = (
      <>
        {style.fill && style.fill2 ? (
          <div style={{ ...layer, filter }}>
            <div style={{ ...layer, clipPath: `path("${d}")`, background: `linear-gradient(${style.gradientAngle}deg, ${style.fill}, ${style.fill2})` }} />
          </div>
        ) : style.fill ? (
          <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ ...layer, overflow: "visible", filter }}>
            <path d={d} fill={style.fill} />
          </svg>
        ) : null}
        {style.stroke && style.strokeWidth > 0 ? <StrokeView d={d} width={w} height={h} stroke={style.stroke} strokeWidth={style.strokeWidth} dash={style.dash} join="round" /> : null}
      </>
    )
  }
  const label = style.label
  return (
    <>
      {body}
      {element.content.trim() ? (
        <TextLines
          content={element.content}
          width={element.width}
          height={element.height}
          input={shapeLabelInput(element)}
          paint={{ color: label.color, align: "center", underline: false, strike: false, effect: "none", effectColor: label.color }}
          measure={measure}
          hidden={editing}
        />
      ) : null}
    </>
  )
}

/**
 * The picture URL the screen can load. Same-origin paths stay relative (the
 * server and the browser render the same markup); remote pictures are blocked
 * by the app's CSP (`img-src 'self' data: blob:`) and show their frame, which
 * is also what the export draws for them.
 */
export function screenImageSource(content: string): string | null {
  const value = String(content ?? "").trim()
  if (/^data:image\//i.test(value)) return sanitizeImageUrl(value)
  if (value.startsWith("/") && !value.startsWith("//") && sanitizeImageUrl(value)) return value
  return null
}

function ImageElementView({ element, unit, placeholders }: { element: CanvasElement; unit: number; placeholders: boolean }) {
  const style = readImageStyle(element)
  const src = screenImageSource(element.content)
  const d = maskPath(style.mask, element.width, element.height, style.radius) ?? shapePath("rect", element.width, element.height)
  const shadow = shadowSpec(style.shadow, unit)
  const filter = shadow ? `drop-shadow(${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color})` : undefined
  const transform = style.flipX || style.flipY ? `scale(${style.flipX ? -1 : 1}, ${style.flipY ? -1 : 1})` : undefined
  const focus = style.fit === "cover" ? `${style.focusX * 100}% ${style.focusY * 100}%` : "50% 50%"
  // Like the export: an unloaded frame is grey; a shadowed frame is filled
  // (white unless it has a colour) so the shadow has a shape to fall from.
  const frameFill = src ? (style.background ?? (shadow ? "#FFFFFF" : undefined)) : (style.background ?? "#EEF0F4")
  return (
    <>
      <div style={{ ...layer, filter }}>
        <div style={{ ...layer, clipPath: `path("${d}")`, background: frameFill }}>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- design pictures are user uploads at their stored size
            <img src={src} alt="" loading="lazy" draggable={false} decoding="async" style={{ ...layer, objectFit: style.fit, objectPosition: focus, transform, filter: imageFilterCss(style.filter) || undefined }} />
          ) : null}
        </div>
      </div>
      {!src && placeholders ? <PicturePlaceholder width={element.width} height={element.height} /> : null}
      {style.stroke && style.strokeWidth > 0 ? <StrokeView d={d} width={element.width} height={element.height} stroke={style.stroke} strokeWidth={style.strokeWidth} dash={style.dash} /> : null}
    </>
  )
}

function PicturePlaceholder({ width, height }: { width: number; height: number }) {
  const size = Math.max(16, Math.min(width, height) * 0.22)
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} style={{ position: "absolute", left: (width - size) / 2, top: (height - size) / 2, color: "#9AA1AE" }}>
      <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m4 17 5-5 4 4 2.5-2.5L20 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="15.5" cy="9" r="1.6" fill="currentColor" />
    </svg>
  )
}

function EmbedElementView({ element, measure }: { element: CanvasElement; measure: MeasureText }) {
  const size = Math.max(10, Math.min(element.width, element.height) * 0.09)
  return (
    <>
      <div style={{ ...layer, background: "#1F2430", borderRadius: Math.min(element.width, element.height) * 0.06 }} />
      <TextLines
        content={embedLabel(element.content)}
        width={element.width}
        height={element.height}
        input={{ font: "sans", size, weight: 600, italic: false, letterSpacing: 0, lineHeight: 1.2, uppercase: false, list: "none", verticalAlign: "middle", fit: "shrink", padding: size }}
        paint={{ color: "#FFFFFF", align: "center", underline: false, strike: false, effect: "none", effectColor: "#FFFFFF" }}
        measure={measure}
      />
    </>
  )
}

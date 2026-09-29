import type { SlideObject, WorkspaceDeck } from "@/components/learn/types"
import { createElement, type CanvasElement } from "@/lib/studio/canvas-engine"
import { slideDesignPresets } from "@/lib/studio-design"
import { isElementAnimation, withElementAnimation } from "./animation"
import { createDesignDoc, createDesignPage, DESIGN_LIMITS, scaleDesign, type DesignDoc } from "./document"
import { designFormat, slidesFormatId } from "./formats"
import { serializeTableCells } from "./table"

type DeckSlide = WorkspaceDeck["slides"][number]

function assertTextFits(value: string | undefined, limit: number): void {
  if (value && value.length > limit) throw new Error(`A slide exceeds the design text limit (${limit} characters). Split it before converting.`)
}

/**
 * The old slides' table was one row of column labels ("Concept | Evidence |
 * Action") over a see-through fill, split by faint lines. It becomes a real
 * one-row table with the same look, ready for more rows.
 */
function tableElement(object: SlideObject, index: number, width: number, height: number, locked: boolean): CanvasElement {
  const columns = (object.text || "Concept | Evidence | Action").split("|").map((item) => item.trim())
  const content = serializeTableCells([columns])
  assertTextFits(content, DESIGN_LIMITS.contentLength)
  const style = object.style ?? {}
  return createElement({
    id: `object-${index}-${object.id}`, type: "table",
    x: object.x * width / 100, y: object.y * height / 100,
    width: object.w * width / 100, height: object.h * height / 100,
    z: index, content, locked,
    style: {
      fontFamily: "sans",
      fontSize: typeof style.fontSize === "number" ? style.fontSize : 12,
      fontWeight: 600,
      color: typeof style.color === "string" ? style.color : "#ffffff",
      fill: typeof style.background === "string" ? style.background : undefined,
      stroke: "rgba(255,255,255,0.2)",
      strokeWidth: 1,
      padding: 8,
      verticalAlign: "top",
      name: object.text?.slice(0, 60) || "Table",
    },
  })
}

function objectElement(object: SlideObject, index: number, width: number, height: number, locked: boolean): CanvasElement {
  if (object.type === "table") return tableElement(object, index, width, height, locked)
  const content = object.type === "image" ? object.src || "" : object.text || ""
  assertTextFits(content, DESIGN_LIMITS.contentLength)
  return createElement({
    id: `object-${index}-${object.id}`, type: object.type === "image" ? "image" : object.type === "shape" ? "shape" : "text",
    x: object.x * width / 100, y: object.y * height / 100,
    width: object.w * width / 100, height: object.h * height / 100,
    z: index, content, locked,
    style: { fontFamily: "sans", fontSize: 20, color: "#ffffff", padding: 8, fit: "shrink", ...object.style, fill: object.style?.background, name: object.type === "image" ? "Slide image" : object.text?.slice(0, 60) || object.type },
  })
}

function slideElements(slide: DeckSlide, width: number, height: number): CanvasElement[] {
  // Studio replaces its title/body layout when authored objects are present.
  if (slide.objects?.length) {
    if (slide.objects.length > DESIGN_LIMITS.elementsPerPage) throw new Error("A slide has too many objects to convert without losing content.")
    return slide.objects.map((object, index) => objectElement(object, index, width, height, Boolean(slide.locked)))
  }
  const palette = slideDesignPresets[slide.theme as keyof typeof slideDesignPresets] ?? slideDesignPresets.midnight
  const fields = [
    { content: slide.accent || "", y: 36, height: 28, fontSize: 14, color: palette.accent, fontWeight: 700 },
    { content: slide.title, y: 78, height: 90, fontSize: 42, color: palette.foreground, fontWeight: 700 },
    { content: slide.body, y: 188, height: height - 230, fontSize: 24, color: palette.foreground, fontWeight: 400 },
  ]
  return fields.map((field, index) => {
    assertTextFits(field.content, DESIGN_LIMITS.contentLength)
    return createElement({ type: "text", id: `text-${index}`, x: 48, y: field.y, width: width - 96, height: field.height, content: field.content, z: index, locked: Boolean(slide.locked), style: { fontFamily: "sans", fontSize: field.fontSize, fontWeight: field.fontWeight, color: field.color, fit: "shrink", padding: 0 } })
  })
}

/** A slide's animation becomes each of its elements' entrance (empty text boxes have nothing to show). */
function withSlideAnimation(elements: CanvasElement[], slide: DeckSlide): CanvasElement[] {
  const animation = isElementAnimation(slide.animation) ? slide.animation : null
  if (!animation) return elements
  return elements.map((element) => (element.type === "text" && !element.content.trim() ? element : withElementAnimation(element, animation)))
}

/**
 * The editable Studio slide model, preserving authored objects and slide metadata.
 * Slides are laid out at the old 960-point width, then scaled to a presentation
 * format, so a converted deck opens with the filmstrip like any other slides.
 */
export function deckToDesign(input: { title: string; slides: readonly DeckSlide[]; aspect?: "16:9" | "4:3"; id?: string }): DesignDoc {
  if (!input.slides.length) throw new Error("Add a slide before converting this deck.")
  if (input.slides.length > DESIGN_LIMITS.pages) throw new Error(`Designs support up to ${DESIGN_LIMITS.pages} pages. Split this deck before converting.`)
  const width = 960
  const height = input.aspect === "4:3" ? 720 : 540
  const doc = createDesignDoc({ id: input.id, name: input.title, format: "custom", width, height, pages: input.slides.map((slide, index) => {
    assertTextFits(slide.speakerNotes, DESIGN_LIMITS.notesLength)
    const palette = slideDesignPresets[slide.theme as keyof typeof slideDesignPresets] ?? slideDesignPresets.midnight
    const transition = slide.transition === "push" || slide.transition === "wipe" ? "slide" : slide.transition === "none" || slide.transition === "zoom" ? slide.transition : "fade"
    return createDesignPage({ id: `slide-${index + 1}`, background: slide.background || palette.background, elements: withSlideAnimation(slideElements(slide, width, height), slide), hidden: slide.hidden, notes: slide.speakerNotes, transition })
  }) })
  const format = designFormat(slidesFormatId(input.aspect))
  return scaleDesign(doc, { format: format.id, width: format.width, height: format.height })
}

/**
 * The design an old deck becomes. One id per deck, so opening the deck twice,
 * or in two tabs, finds the same copy instead of making another.
 */
export function deckDesignId(deckId: string): string {
  return `design-${deckId}`.slice(0, 80)
}

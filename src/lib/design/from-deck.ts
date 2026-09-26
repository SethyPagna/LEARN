import type { SlideObject, WorkspaceDeck } from "@/components/learn/types"
import { createElement, type CanvasElement } from "@/lib/studio/canvas-engine"
import { slideDesignPresets } from "@/lib/studio-design"
import { createDesignDoc, createDesignPage, DESIGN_LIMITS, type DesignDoc } from "./document"

type DeckSlide = WorkspaceDeck["slides"][number]

function assertTextFits(value: string | undefined, limit: number): void {
  if (value && value.length > limit) throw new Error(`A slide exceeds the design text limit (${limit} characters). Split it before converting.`)
}

function objectElement(object: SlideObject, index: number, width: number, height: number, locked: boolean): CanvasElement {
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

/** The editable Studio slide model, preserving authored objects and slide metadata. */
export function deckToDesign(input: { title: string; slides: readonly DeckSlide[]; aspect?: "16:9" | "4:3" }): DesignDoc {
  if (!input.slides.length) throw new Error("Add a slide before converting this deck.")
  if (input.slides.length > DESIGN_LIMITS.pages) throw new Error(`Designs support up to ${DESIGN_LIMITS.pages} pages. Split this deck before converting.`)
  const width = 960
  const height = input.aspect === "4:3" ? 720 : 540
  return createDesignDoc({ name: input.title, format: "custom", width, height, pages: input.slides.map((slide, index) => {
    assertTextFits(slide.speakerNotes, DESIGN_LIMITS.notesLength)
    const palette = slideDesignPresets[slide.theme as keyof typeof slideDesignPresets] ?? slideDesignPresets.midnight
    const transition = slide.transition === "push" || slide.transition === "wipe" ? "slide" : slide.transition === "none" || slide.transition === "zoom" ? slide.transition : "fade"
    return createDesignPage({ id: `slide-${index + 1}`, background: slide.background || palette.background, elements: slideElements(slide, width, height), hidden: slide.hidden, notes: slide.speakerNotes, transition })
  }) })
}

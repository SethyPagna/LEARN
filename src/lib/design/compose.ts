import { DESIGN_LIMITS, type DesignDoc, type DesignPage } from "./document"
import { designFromSpec } from "./layout"
import type { DesignSpec } from "./spec"
import type { DesignTemplate } from "./templates"
import type { MeasureText } from "./text"

/**
 * Adding laid-out pages to a design that already exists: Magic design text, a
 * note, or a template. New pages take the design's own size, and its theme
 * unless the design is still blank (then a template brings its look along).
 *
 * Pure: no DOM, no React.
 */

export const UNTITLED_DESIGN = "Untitled design"

/** One empty page and nothing else: safe to replace rather than add to. */
export function isBlankDesign(doc: Pick<DesignDoc, "pages">): boolean {
  return doc.pages.length === 1 && doc.pages[0].elements.length === 0 && !doc.pages[0].notes
}

/** Pages for a spec, sized for this design. */
export function pagesFromSpec(doc: Pick<DesignDoc, "width" | "height" | "theme">, spec: DesignSpec, options: { theme?: string; measure?: MeasureText } = {}): DesignPage[] {
  return designFromSpec(spec, { format: "custom", width: doc.width, height: doc.height, theme: options.theme ?? doc.theme, measure: options.measure }).pages
}

/** Insert pages after `afterIndex`, as many as the page limit allows. */
export function insertPages(doc: DesignDoc, afterIndex: number, pages: readonly DesignPage[]): { doc: DesignDoc; index: number; added: number } {
  const room = Math.max(0, DESIGN_LIMITS.pages - doc.pages.length)
  const taken = pages.slice(0, room)
  const at = Math.max(0, Math.min(doc.pages.length, Math.floor(afterIndex) + 1))
  if (!taken.length) return { doc, index: Math.min(doc.pages.length - 1, Math.max(0, at - 1)), added: 0 }
  return { doc: { ...doc, pages: [...doc.pages.slice(0, at), ...taken, ...doc.pages.slice(at)] }, index: at, added: taken.length }
}

export interface ComposeResult {
  doc: DesignDoc
  /** The first new page. */
  index: number
  added: number
  /** True when a blank design was replaced rather than added to. */
  replaced: boolean
  /** Pages that did not fit under the page limit. */
  dropped: number
}

function named(doc: DesignDoc, name: string | undefined): string {
  const clean = (name ?? "").trim().slice(0, DESIGN_LIMITS.nameLength)
  return doc.name === UNTITLED_DESIGN && clean ? clean : doc.name
}

function compose(doc: DesignDoc, pages: DesignPage[], pageIndex: number, extra: { name?: string; theme?: string }): ComposeResult {
  if (!pages.length) return { doc, index: pageIndex, added: 0, replaced: false, dropped: 0 }
  if (isBlankDesign(doc)) {
    const kept = pages.slice(0, DESIGN_LIMITS.pages)
    return {
      doc: { ...doc, theme: extra.theme ?? doc.theme, name: named(doc, extra.name), pages: kept },
      index: 0,
      added: kept.length,
      replaced: true,
      dropped: pages.length - kept.length,
    }
  }
  const inserted = insertPages(doc, pageIndex, pages)
  return { doc: inserted.doc, index: inserted.index, added: inserted.added, replaced: false, dropped: pages.length - inserted.added }
}

/** Lay out a spec (typed text, a note) into this design. */
export function composeFromSpec(doc: DesignDoc, spec: DesignSpec, options: { pageIndex: number; measure?: MeasureText }): ComposeResult {
  const pages = pagesFromSpec(doc, spec, { measure: options.measure })
  return compose(doc, pages, options.pageIndex, { name: spec.title })
}

/** Lay out a template into this design. A blank design takes the template's theme and name too. */
export function composeFromTemplate(doc: DesignDoc, template: DesignTemplate, options: { pageIndex: number; measure?: MeasureText; preserveTemplateStyle?: boolean }): ComposeResult {
  const blank = isBlankDesign(doc)
  const theme = blank || options.preserveTemplateStyle ? template.theme : doc.theme
  const pages = pagesFromSpec(doc, template.spec, { theme, measure: options.measure })
  return compose(doc, pages, options.pageIndex, { name: template.name, theme })
}

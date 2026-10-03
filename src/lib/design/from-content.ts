import type { ThemedBlock } from "@/lib/ai/format-response"
import { blocksFromDocumentHtml } from "@/lib/export/html-blocks"

import { parseTextToSpec, SPEC_LIMITS, type DesignSpec } from "./spec"

/**
 * Content from elsewhere in the app, turned into a design.
 *
 * A note, a document or an AI reply is read as blocks (`ThemedBlock`, the
 * vocabulary the DOCX writer and the AI renderer already share), written out
 * as the plain outline `parseTextToSpec` reads (`# title`, `## page`, lists,
 * `> quotes`, `Q:` questions), and parsed into a spec. Going through the
 * outline keeps one set of rules for "what becomes a page, a list, a quote, a
 * quiz card": the same rules that apply to text typed into Magic design.
 *
 * Pure: no DOM, no React.
 */

/** Pictures a page can show: same-origin files and inline data (the page policy blocks the rest). */
function placeablePicture(url: string): boolean {
  return /^\/(?!\/)[\w\-./?=&%]+$/.test(url) || /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(url)
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * A paragraph as one outline line. Heading, quote, picture and page-break
 * markers at its start are dropped so they cannot restructure the design;
 * "Q:" questions and "Term: meaning" lines are kept on purpose (study notes
 * written that way become quiz and definition pages).
 */
function literal(text: string): string {
  return oneLine(text).replace(/^(?:#{1,6}\s+|>\s*|!\[)/, "").replace(/^(?:-{3,}|\*{3,})$/, "")
}

const CHOICE_LETTERS = "abcdef"

/** The outline for a list of blocks (see `parseTextToSpec` for the syntax). */
export function blocksToDesignSource(blocks: readonly ThemedBlock[]): string {
  const lines: string[] = []
  const gap = () => {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("")
  }
  let seenTitle = false
  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const text = oneLine(block.text)
        if (!text) break
        gap()
        if (block.level === 1 && !seenTitle) {
          seenTitle = true
          lines.push(`# ${text}`)
        } else if (block.level <= 3) {
          lines.push(`## ${text}`)
        } else {
          lines.push(literal(text))
        }
        gap()
        break
      }
      case "paragraph": {
        const text = literal(block.text)
        if (!text) break
        gap()
        lines.push(text)
        gap()
        break
      }
      case "list": {
        const items = block.items.map(oneLine).filter(Boolean)
        if (!items.length) break
        gap()
        items.forEach((item, index) => lines.push(block.ordered ? `${index + 1}. ${item}` : `- ${item}`))
        gap()
        break
      }
      case "table": {
        const rows = block.rows.map((row) => row.map(oneLine).filter(Boolean)).filter((row) => row.length)
        if (!rows.length) break
        gap()
        const headers = block.headers.map(oneLine)
        for (const row of rows.slice(0, SPEC_LIMITS.items)) {
          const cells = row.length === 2 && headers.length === 2 ? `${row[0]} — ${row[1]}` : row.join(" · ")
          lines.push(`- ${cells}`)
        }
        gap()
        break
      }
      case "code": {
        const code = oneLine(block.code).slice(0, 400)
        if (!code) break
        gap()
        lines.push(literal(code))
        gap()
        break
      }
      case "quote": {
        const text = oneLine(block.text)
        if (!text) break
        gap()
        lines.push(`> ${text}`)
        gap()
        break
      }
      case "divider":
        gap()
        lines.push("---")
        gap()
        break
      case "image":
        if (!placeablePicture(block.url)) break
        gap()
        lines.push(`![${oneLine(block.alt).replace(/[[\]]/g, "")}](${block.url})`)
        gap()
        break
      case "callout": {
        const text = literal(block.text)
        if (!text) break
        gap()
        lines.push(text)
        gap()
        break
      }
      case "quiz": {
        for (const question of block.questions) {
          const text = oneLine(question.question)
          if (!text) continue
          gap()
          lines.push("---")
          lines.push(`Q: ${text}`)
          question.choices.slice(0, CHOICE_LETTERS.length).forEach((choice, index) => {
            const mark = question.answerId && choice.id === question.answerId ? " *" : ""
            lines.push(`${CHOICE_LETTERS[index]}) ${oneLine(choice.text)}${mark}`)
          })
          gap()
        }
        break
      }
      case "slideOutline": {
        if (block.title && !seenTitle) {
          seenTitle = true
          gap()
          lines.push(`# ${oneLine(block.title)}`)
        }
        for (const slide of block.slides) {
          gap()
          lines.push(`## ${oneLine(slide.title) || "Slide"}`)
          for (const bullet of slide.bullets) if (oneLine(bullet)) lines.push(`- ${oneLine(bullet)}`)
          gap()
        }
        break
      }
    }
  }
  return lines.join("\n").trim()
}

export interface ContentSpecOptions {
  title?: string
  maxPages?: number
}

/** A design spec from blocks (an AI reply, an imported document). */
export function blocksToDesignSpec(blocks: readonly ThemedBlock[], options: ContentSpecOptions = {}): DesignSpec {
  return parseTextToSpec(blocksToDesignSource(blocks), { title: options.title, maxPages: options.maxPages })
}

/** A design spec from a note or document body (TipTap HTML). */
export function htmlToDesignSpec(html: string, options: ContentSpecOptions = {}): DesignSpec {
  return blocksToDesignSpec(blocksFromDocumentHtml(html || ""), options)
}

/** Whether a spec has anything to lay out. */
export function specHasContent(spec: DesignSpec): boolean {
  return spec.pages.some((page) => page.blocks.length > 0)
}

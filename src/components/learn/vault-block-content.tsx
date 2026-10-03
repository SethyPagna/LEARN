"use client"

import { useMemo } from "react"
import { formatAiResponse, type ThemedBlock } from "@/lib/ai/format-response"
import { blocksFromDocumentHtml } from "@/lib/export/html-blocks"
import { AiBlockRenderer } from "./ai-block-renderer"

const MAX_PREVIEW_CHARACTERS = 40_000
const MAX_PREVIEW_BLOCKS = 400

export function VaultBlockContent({ text, blockType = "text", includeStyles = true }: { text: string; blockType?: string; includeStyles?: boolean }) {
  const preview = useMemo(() => {
    const source = text.slice(0, MAX_PREVIEW_CHARACTERS)
    let blocks: ThemedBlock[]
    let shortened = text.length > MAX_PREVIEW_CHARACTERS
    let formattingFailed = false
    try {
      if (blockType === "code") blocks = [{ type: "code", language: "", code: source }]
      else if (blockType === "heading") blocks = [{ type: "heading", level: 3, text: source }]
      else if (/^\s*<(?:p|h[1-6]|div|section|article|ul|ol|table|blockquote|pre)(?:\s|>)/i.test(source)) blocks = blocksFromDocumentHtml(source)
      else {
        const formatted = formatAiResponse({ reply: protectInlineCode(source) })
        blocks = formatted.blocks
        shortened ||= formatted.warnings.some(warning => warning.includes("truncated"))
      }
    } catch {
      blocks = [{ type: "code", language: "", code: source }]
      formattingFailed = true
    }
    shortened ||= blocks.length > MAX_PREVIEW_BLOCKS
    return { blocks: blocks.slice(0, MAX_PREVIEW_BLOCKS), shortened, formattingFailed }
  }, [text, blockType])

  return <div className="mt-1 min-w-0 text-sm">
    <AiBlockRenderer blocks={preview.blocks} inlineMarkdown showDragHandles={false} includeStyles={includeStyles} />
    {preview.formattingFailed ? <p className="mt-2 text-xs text-muted-foreground">Preview could not be formatted. Open the note to edit the source.</p> : null}
    {preview.shortened ? <p className="mt-2 text-xs text-muted-foreground">Content shortened for preview. Open the note for the full source.</p> : null}
  </div>
}

function protectInlineCode(source: string): string {
  let fenced = false
  return source.split("\n").map(line => {
    if (/^\s{0,3}```/.test(line)) {
      fenced = !fenced
      return line
    }
    if (fenced) return line
    // The normalizer strips tags; code entities are decoded only into React code text.
    return line.replace(/`([^`\n]+)`/g, (_, code: string) => `\`${code.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}\``)
  }).join("\n")
}

"use client"

import { Type } from "lucide-react"

import { TEXT_PRESETS, TEXT_PRESET_IDS, type TextPresetId } from "@/lib/design/editing"
import { designFontStack } from "@/lib/design/fonts"
import { themeTextStyle } from "@/lib/design/themes"

import { elementForItem, type DesignDragItem } from "../design-drag"
import type { DesignEditorApi } from "../editor-types"
import { ItemTile, PanelHeading } from "./panel-kit"

/**
 * Text styles in the design's theme. Each tile previews the font, weight and
 * colour the text box will get, and adds it on click or drop.
 */

const PREVIEW_SIZE: Record<TextPresetId, number> = {
  title: 26,
  heading: 21,
  subheading: 17,
  body: 14,
  bullets: 13,
  quote: 16,
  caption: 12,
  kicker: 11,
}

const PREVIEW_TEXT: Record<TextPresetId, string> = {
  title: "Add a title",
  heading: "Add a heading",
  subheading: "Add a subheading",
  body: "Add a little bit of body text",
  bullets: "• First idea\n• Second idea",
  quote: "“A quote worth keeping”",
  caption: "Add a caption",
  kicker: "SECTION LABEL",
}

export function TextPanel({ api }: { api: DesignEditorApi }) {
  const pick = (item: DesignDragItem) => {
    api.insertElements([elementForItem(item, api.theme, { width: api.design.width, height: api.design.height }, api.measure)])
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => pick({ kind: "text", preset: "body" })}
        className="mb-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_12px_24px_-16px_var(--primary)] transition hover:brightness-110 active:scale-[0.99]"
      >
        <Type className="h-4 w-4" aria-hidden="true" />
        Add a text box
      </button>
      <PanelHeading>Text styles</PanelHeading>
      <div className="grid gap-2">
        {TEXT_PRESET_IDS.map((preset) => {
          const spec = TEXT_PRESETS[preset]
          const look = themeTextStyle(api.theme, spec.role)
          return (
            <ItemTile key={preset} item={{ kind: "text", preset }} label={spec.label} onPick={pick} className="!justify-start px-3 py-3 text-left">
              <span
                data-drag-preview="true"
                className="block whitespace-pre-line leading-tight"
                style={{
                  fontFamily: designFontStack(look.font),
                  fontWeight: look.weight,
                  fontStyle: look.italic ? "italic" : "normal",
                  fontSize: PREVIEW_SIZE[preset],
                  letterSpacing: spec.letterSpacing ? `${spec.letterSpacing}em` : undefined,
                  textTransform: look.uppercase ? "uppercase" : undefined,
                  color: "var(--foreground)",
                }}
              >
                {PREVIEW_TEXT[preset]}
              </span>
            </ItemTile>
          )
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Tip: double-click any text on the page to type. Press <kbd className="learn-kbd">T</kbd> to add a text box.
      </p>
    </div>
  )
}

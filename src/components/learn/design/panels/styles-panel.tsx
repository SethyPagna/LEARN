"use client"

import { Check } from "lucide-react"

import { applyTheme, PAGE_TRANSITIONS, updatePage, type PageTransition } from "@/lib/design/document"
import { designFontStack } from "@/lib/design/fonts"
import { PAGE_PATTERNS, type PagePattern } from "@/lib/design/shapes"
import { designThemes } from "@/lib/design/themes"

import { ColorPicker } from "../color-picker"
import type { DesignEditorApi } from "../editor-types"
import { PanelHeading } from "./panel-kit"

/**
 * The whole design's look: its theme (colours and fonts for everything a
 * layout made; hand-picked colours are kept), and the current page's
 * background, paper pattern and present-mode transition.
 */

const PATTERN_LABELS: Record<PagePattern, string> = { none: "Plain", lines: "Lined", grid: "Grid", dots: "Dots" }
const TRANSITION_LABELS: Record<PageTransition, string> = { none: "None", fade: "Fade", slide: "Slide", zoom: "Zoom" }

export function StylesPanel({ api }: { api: DesignEditorApi }) {
  const page = api.design.pages[api.pageIndex]
  const setPage = (patch: Parameters<typeof updatePage>[2]) => api.update((design) => updatePage(design, api.pageIndex, patch))

  return (
    <div>
      <PanelHeading>Themes</PanelHeading>
      <div className="grid grid-cols-2 gap-2">
        {designThemes.map((theme) => {
          const active = theme.id === api.design.theme
          return (
            <button
              key={theme.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (active) return
                api.update((design) => applyTheme(design, theme.id))
                api.notify(`${theme.label} theme applied to every page.`)
              }}
              className={`relative overflow-hidden rounded-xl text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-18px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "ring-2 ring-primary" : "ring-1 ring-border"}`}
              style={{ background: theme.palette.background }}
              title={`${theme.label} theme`}
            >
              <span className="block px-3 pb-2 pt-3" style={{ color: theme.palette.text }}>
                <span className="block truncate text-[1.05rem] leading-tight" style={{ fontFamily: designFontStack(theme.fonts.heading), fontWeight: theme.headingWeight, color: theme.palette.primary, textTransform: theme.uppercaseTitles ? "uppercase" : undefined }}>
                  {theme.label}
                </span>
                <span className="mt-0.5 block truncate text-[0.7rem] opacity-80" style={{ fontFamily: designFontStack(theme.fonts.body) }}>
                  Body text Aa
                </span>
              </span>
              <span className="flex h-2.5 w-full">
                {[theme.palette.primary, theme.palette.secondary, theme.palette.accent, theme.palette.surface].map((color, index) => (
                  <span key={index} className="flex-1" style={{ background: color }} />
                ))}
              </span>
              {active ? (
                <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {page ? (
        <>
          <PanelHeading
            action={
              api.design.pages.length > 1 ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-primary hover:underline"
                  onClick={() => {
                    api.update((design) => ({ ...design, pages: design.pages.map((candidate) => ({ ...candidate, background: page.background, backgroundRole: page.backgroundRole, pattern: page.pattern })) }))
                    api.notify("This background is now on every page.")
                  }}
                >
                  Apply to all pages
                </button>
              ) : null
            }
          >
            Page {api.pageIndex + 1} background
          </PanelHeading>
          <ColorPicker
            value={page.background}
            onChange={(color) => color && setPage({ background: color, backgroundRole: null })}
            theme={api.theme}
            design={api.design}
          />
          {page.backgroundRole === null ? (
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-primary hover:underline"
              onClick={() => setPage({ background: api.theme.palette.background, backgroundRole: "background" })}
            >
              Use the theme background again
            </button>
          ) : null}

          <PanelHeading>Paper</PanelHeading>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Page paper">
            {PAGE_PATTERNS.map((pattern) => (
              <button
                key={pattern}
                type="button"
                role="radio"
                aria-checked={page.pattern === pattern}
                onClick={() => setPage({ pattern })}
                className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${page.pattern === pattern ? "bg-foreground text-background" : "bg-muted hover:bg-accent"}`}
              >
                {PATTERN_LABELS[pattern]}
              </button>
            ))}
          </div>

          <PanelHeading>Transition when presenting</PanelHeading>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Page transition">
            {PAGE_TRANSITIONS.map((transition) => (
              <button
                key={transition}
                type="button"
                role="radio"
                aria-checked={page.transition === transition}
                onClick={() => setPage({ transition })}
                className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${page.transition === transition ? "bg-foreground text-background" : "bg-muted hover:bg-accent"}`}
              >
                {TRANSITION_LABELS[transition]}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

"use client"

import { useDeferredValue, useMemo, useState } from "react"
import { NotebookText, Sparkles, WandSparkles } from "lucide-react"

import { composeFromSpec } from "@/lib/design/compose"
import { htmlToDesignSpec, specHasContent } from "@/lib/design/from-content"
import { inferPageSpec, layoutChoices, relayoutPage } from "@/lib/design/layout"
import { parseTextToSpec, type DesignSpec, type LayoutId } from "@/lib/design/spec"

import type { DesignEditorApi } from "../editor-types"
import { FitThumbnail } from "../fit-thumbnail"
import { EmptyHint, PanelHeading, PanelSearch } from "./panel-kit"

/**
 * The layout engine, offered three ways:
 *
 *  - "Arrange this page": the page's content laid out in every layout that
 *    suits it, previewed; one click re-arranges it (hand-added extras stay).
 *  - "Write it, we design it": an outline typed or pasted in becomes pages.
 *  - "From your notes": a note becomes pages the same way.
 *
 * Everything is one undoable step.
 */

export const LAYOUT_LABELS: Record<LayoutId, string> = {
  cover: "Cover",
  section: "Section",
  bullets: "List",
  split: "Split",
  compare: "Compare",
  quote: "Quote",
  stats: "Big numbers",
  timeline: "Timeline",
  steps: "Steps",
  question: "Quiz card",
  definition: "Definition",
  text: "Text",
  meme: "Meme",
  closing: "Closing",
}

const EXAMPLE = `# The water cycle
## Four steps
1. Evaporation: the sun warms the sea
2. Condensation: vapour cools into clouds
3. Precipitation: rain and snow fall
4. Collection: water gathers in rivers
> Water never leaves; it only travels. — Ms. Lee
## Quick check
Q: What makes clouds form?
a) Condensation *
b) Evaporation
c) Collection`

export function MagicPanel({ api }: { api: DesignEditorApi }) {
  const [draft, setDraft] = useState("")
  const [noteQuery, setNoteQuery] = useState("")
  const deferredDesign = useDeferredValue(api.design)
  const pageIndex = Math.min(api.pageIndex, deferredDesign.pages.length - 1)
  const page = deferredDesign.pages[pageIndex]

  const choices = useMemo(() => {
    if (!page) return []
    const inferred = inferPageSpec(page, { first: pageIndex === 0 })
    if (!inferred) return []
    return layoutChoices(inferred.spec, pageIndex, deferredDesign.pages.length).map((layout) => {
      const result = relayoutPage(deferredDesign, pageIndex, { layout, measure: api.measure })
      return { layout, page: result.doc.pages[pageIndex], added: result.added }
    })
  }, [api.measure, deferredDesign, page, pageIndex])

  const arrange = (layout: LayoutId) => {
    let added = 0
    api.update((design) => {
      const result = relayoutPage(design, api.pageIndex, { layout, measure: api.measure })
      added = result.added
      return { doc: result.doc, page: api.pageIndex, select: [] }
    })
    api.notify(added ? `Arranged as ${LAYOUT_LABELS[layout]}; the rest continues on ${added} new page${added === 1 ? "" : "s"}.` : `Arranged as ${LAYOUT_LABELS[layout]}.`)
  }

  const build = (spec: DesignSpec, source: string) => {
    if (!specHasContent(spec)) {
      api.notify(`${source} has nothing to lay out yet.`)
      return
    }
    let summary = ""
    api.update((design) => {
      const result = composeFromSpec(design, spec, { pageIndex: api.pageIndex, measure: api.measure })
      summary = result.added
        ? `${result.replaced ? "Designed" : "Added"} ${result.added} page${result.added === 1 ? "" : "s"} from ${source.toLowerCase()}${result.dropped ? ` (${result.dropped} did not fit the 60-page limit)` : ""}.`
        : "This design already has the most pages it can hold."
      return { doc: result.doc, page: result.index, select: [] }
    })
    api.notify(summary)
  }

  const notes = useMemo(() => {
    const needle = noteQuery.trim().toLowerCase()
    return api.notes
      .filter((note) => !note.archived_at && (!needle || note.title.toLowerCase().includes(needle) || (note.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))))
      .slice(0, 40)
  }, [api.notes, noteQuery])

  const layoutPages = deferredDesign.pages.filter((candidate) => candidate.spec).length

  return (
    <div>
      <PanelHeading>Arrange this page</PanelHeading>
      {choices.length ? (
        <div className="grid grid-cols-2 gap-2">
          {choices.map((choice) => {
            const current = page?.layout === choice.layout
            return (
              <button
                key={choice.layout}
                type="button"
                onClick={() => arrange(choice.layout)}
                aria-pressed={current}
                className={`group overflow-hidden rounded-xl bg-muted/60 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-18px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${current ? "ring-2 ring-primary" : ""}`}
                title={`Arrange this page as ${LAYOUT_LABELS[choice.layout]}`}
              >
                <FitThumbnail width={deferredDesign.width} height={deferredDesign.height} theme={deferredDesign.theme} page={choice.page} measure={api.measure} maxHeight={180} className="pointer-events-none" />
                <span className="flex items-center justify-between gap-1 px-2 py-1.5 text-[0.72rem] font-semibold">
                  {LAYOUT_LABELS[choice.layout]}
                  {choice.added ? <span className="font-normal text-muted-foreground">+{choice.added} p</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <EmptyHint>Add a title, some text or a list to this page and Magic layout will offer ways to arrange it.</EmptyHint>
      )}
      {layoutPages > 1 ? (
        <button
          type="button"
          className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-muted text-xs font-semibold transition hover:bg-accent hover:text-accent-foreground"
          onClick={() => {
            api.update((design) => {
              let next = design
              for (let index = next.pages.length - 1; index >= 0; index -= 1) {
                if (next.pages[index].spec) next = relayoutPage(next, index, { measure: api.measure }).doc
              }
              return next
            })
            api.notify("Every layout page was re-arranged to fit its content.")
          }}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Tidy every layout page
        </button>
      ) : null}

      <PanelHeading
        action={
          <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setDraft(EXAMPLE)}>
            Show an example
          </button>
        }
      >
        Write it, we design it
      </PanelHeading>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={7}
        placeholder={"Type or paste an outline:\n# Title\n## A page heading\n- a list item\n> a quote — someone\nQ: a quiz question\na) answer *"}
        className="w-full resize-y rounded-xl border border-border bg-background p-3 font-mono text-xs leading-5 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        aria-label="Outline to design"
      />
      <button
        type="button"
        disabled={!draft.trim()}
        onClick={() => build(parseTextToSpec(draft), "Your outline")}
        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
      >
        <WandSparkles className="h-4 w-4" aria-hidden="true" />
        Design these pages
      </button>
      <p className="mt-1.5 text-[0.7rem] leading-4 text-muted-foreground"># starts the cover, ## or --- starts a page. Lists, quotes, “Term: meaning”, numbers and Q: questions each get their own look.</p>

      <PanelHeading>From your notes</PanelHeading>
      {api.notes.length ? (
        <>
          <PanelSearch value={noteQuery} onChange={setNoteQuery} placeholder="Find a note" label="Find a note" />
          <ul className="grid gap-1">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => build(htmlToDesignSpec(note.content, { title: note.title }), `“${note.title || "Untitled note"}”`)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-muted"
                  title={`Design pages from ${note.title || "this note"}`}
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base" aria-hidden="true">
                    {note.icon || <NotebookText className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{note.title || "Untitled note"}</span>
                </button>
              </li>
            ))}
          </ul>
          {!notes.length ? <EmptyHint>No note matches “{noteQuery}”.</EmptyHint> : null}
        </>
      ) : (
        <EmptyHint>Your notes show up here. Write one in Notes and turn it into slides, a poster or a study guide.</EmptyHint>
      )}
    </div>
  )
}

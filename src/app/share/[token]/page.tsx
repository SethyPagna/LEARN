/**
 * `/share/[token]` — the rendered half of a share link.
 *
 * `createShareLink` mints a bearer token; `/api/share/[token]` already served
 * the stored record for it as JSON. That made a copied link a wall of JSON, so
 * this page is the same token rendered for a person: a server component with no
 * session that resolves the grant, re-checks it, and renders the item read-only.
 *
 * The rules it inherits from the API half, and the reasons they matter:
 *
 *   - Every rejection is `notFound()`. Unknown, expired, revoked, archived and
 *     dangling all look identical to the reader, so the page cannot be used to
 *     probe which tokens used to exist — and a failure is the app's 404 page,
 *     never an error page with a stack or a half-rendered item.
 *   - The grant's role decides what is rendered, not what is requested: a
 *     `viewer` link on a quiz never receives the answer key, because
 *     `readSharedContentPayload` withholds it for that role.
 *   - Nothing here is interactive and nothing is injected: every stored value
 *     becomes a text node or a validated attribute, there is no
 *     `dangerouslySetInnerHTML`, and the same colour/URL validators the canvas
 *     editor uses (`@/lib/studio/canvas-styles`) gate the canvas preview.
 *
 * Rendering is chosen by the item's source: a note and a document go through the
 * existing themed block renderer, a sheet renders as a table, a slide deck as an
 * ordered outline, a quiz as its questions, and a canvas as a read-only preview
 * of its elements.
 */

import Link from "next/link"
import { notFound } from "next/navigation"

import { AiBlockRenderer } from "@/components/learn/ai-block-renderer"
import { formatAiResponse, type ThemedBlock } from "@/lib/ai/format-response"
import { readSharedContentPayload, resolveContentRoleForToken, resolveShareToken, type ShareLinkRole } from "@/lib/data"
import { blocksFromDocumentHtml } from "@/lib/export/html-blocks"
import { normalizeCanvasDoc, type CanvasDoc, type CanvasElement } from "@/lib/studio/canvas-engine"
import { safeColor, safeNumber, sanitizeImageUrl } from "@/lib/studio/canvas-styles"

// A token is resolved per request against the database; there is nothing to
// prerender and a cached page must never outlive a revoke.
export const dynamic = "force-dynamic"

interface SharedItem {
  title: string
  itemType: string
  sourceTable: string
  documentType: string
  role: ShareLinkRole
  payload: Record<string, unknown>
}

interface SharePageProps {
  params: Promise<{ token: string }>
}

/**
 * Resolve the token to a renderable item, or `null` for anything at all that
 * should be a 404 — including a deployment whose database is not reachable,
 * which must not become an error page on a public URL.
 */
async function readSharedItem(token: string): Promise<SharedItem | null> {
  try {
    const resolved = await resolveShareToken(token)
    if (!resolved) return null

    const role = resolveContentRoleForToken(resolved)
    // "none" is archived or unreachable; anything that is not a link role is not
    // something a share link can confer, so it is refused rather than widened.
    if (role !== "viewer" && role !== "editor") return null

    const payload = await readSharedContentPayload(resolved.item.source_table, resolved.item.source_id, role)
    if (!payload) return null

    return {
      title: String(resolved.item.title || "Untitled"),
      itemType: String(resolved.item.item_type || ""),
      sourceTable: String(resolved.item.source_table || ""),
      documentType: typeof payload.document_type === "string" ? payload.document_type : "",
      role,
      payload,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Payload narrowing — stored JSON is data, never structure we can trust
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asMatrix(value: unknown): string[][] {
  if (!Array.isArray(value)) return []
  return value.map((row) => (Array.isArray(row) ? row.map((cell) => (typeof cell === "string" ? cell : String(cell ?? ""))) : []))
}

function asList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.map(asRecord)
}

/** Themed blocks for the item types that have a stored text body. */
function contentBlocks(item: SharedItem): ThemedBlock[] {
  if (item.sourceTable === "notes") {
    // A note body is markdown/plain text, which is exactly what the normalizer
    // reads — the same path an AI reply takes, so nothing new is invented here.
    return formatAiResponse({ reply: asText(item.payload.content) }).blocks
  }
  if (item.sourceTable === "editor_documents") {
    // A document is stored as TipTap HTML; `html-blocks` is the reader for that
    // vocabulary, so an imported or hand-written document renders as blocks.
    return blocksFromDocumentHtml(asText(asRecord(item.payload.content).text))
  }
  return []
}

function kindLabel(item: SharedItem): string {
  if (item.sourceTable === "editor_documents") return item.documentType === "canvas" ? "canvas" : "document"
  if (item.sourceTable === "sheet_documents") return "sheet"
  if (item.sourceTable === "slide_decks") return "slide deck"
  if (item.sourceTable === "quizzes") return "practice set"
  if (item.itemType === "note" || item.sourceTable === "notes") return "note"
  return "item"
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params
  const item = await readSharedItem(token)
  if (!item) notFound()

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{`Shared ${kindLabel(item)}`}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{item.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">A read-only copy shared by link. Anything you change here is not saved.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            {item.role === "editor" ? "Editor" : "Viewer"}
          </span>
          <Link href="/login" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <SharedItemBody item={item} />
    </main>
  )
}

function SharedItemBody({ item }: { item: SharedItem }) {
  if (item.sourceTable === "editor_documents" && item.documentType === "canvas") {
    return <CanvasPreview doc={normalizeCanvasDoc(item.payload.content)} />
  }
  if (item.sourceTable === "sheet_documents") {
    return <SheetTable cells={asMatrix(item.payload.cells)} />
  }
  if (item.sourceTable === "slide_decks") {
    return <SlideOutline slides={asList(item.payload.slides)} />
  }
  if (item.sourceTable === "quizzes") {
    return <QuizQuestions items={asList(item.payload.questions)} revealAnswers={item.role === "editor"} />
  }

  const blocks = contentBlocks(item)
  if (!blocks.length) {
    return <p className="rounded-[12px] border border-dashed border-border p-4 text-sm text-muted-foreground">This item has no content to preview.</p>
  }
  // The themed renderer from the AI surface, reused rather than reimplemented.
  return <AiBlockRenderer blocks={blocks} />
}

// ---------------------------------------------------------------------------
// Per-type, read-only renderers
// ---------------------------------------------------------------------------

/** A sheet row-major, with real table semantics. */
function SheetTable({ cells }: { cells: string[][] }) {
  const rows = cells.filter((row) => row.length)
  if (!rows.length) {
    return <p className="rounded-[12px] border border-dashed border-border p-4 text-sm text-muted-foreground">This sheet is empty.</p>
  }
  return (
    <div className="overflow-x-auto rounded-[12px] border border-border">
      <table className="w-full border-collapse text-sm text-card-foreground">
        <caption className="sr-only">Sheet contents</caption>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border last:border-b-0">
              {row.map((cell, columnIndex) => (
                <td key={columnIndex} className="border-r border-border px-3 py-1.5 align-top last:border-r-0">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A deck as an ordered outline: what the slides say, in order. */
function SlideOutline({ slides }: { slides: Record<string, unknown>[] }) {
  if (!slides.length) {
    return <p className="rounded-[12px] border border-dashed border-border p-4 text-sm text-muted-foreground">This deck has no slides.</p>
  }
  return (
    <ol className="space-y-3">
      {slides.map((slide, index) => {
        const hidden = slide.hidden === true
        return (
          <li key={index} className="rounded-[12px] border border-border bg-card p-4">
            <h2 className="text-lg font-semibold text-foreground">{`Slide ${index + 1}: ${asText(slide.title) || "Untitled"}`}</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {hidden ? "Hidden in the deck" : asText(slide.layout) || "default layout"}
            </p>
            {asText(slide.body) ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{asText(slide.body)}</p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * A quiz as its questions.
 *
 * `revealAnswers` is the grant's role, not a setting: a viewer link renders the
 * questions and their choices, and only an editor link is marked up with the
 * correct choice — the payload itself already withheld the key for the viewer,
 * so this is the second half of one rule.
 */
function QuizQuestions({ items, revealAnswers }: { items: Record<string, unknown>[]; revealAnswers: boolean }) {
  if (!items.length) {
    return <p className="rounded-[12px] border border-dashed border-border p-4 text-sm text-muted-foreground">This practice set has no questions.</p>
  }
  return (
    <ol className="space-y-3">
      {items.map((question, index) => {
        const correct = asText(question.correct_answer_id)
        const choices = asList(question.choices)
        return (
          <li key={asText(question.id) || index} className="rounded-[12px] border border-border p-4">
            <h2 className="font-semibold text-foreground">{`Question ${index + 1}: ${asText(question.question)}`}</h2>
            <ul className="mt-3 space-y-1.5">
              {choices.map((choice) => {
                const isCorrect = revealAnswers && correct !== "" && asText(choice.id) === correct
                return (
                  <li
                    key={asText(choice.id) || asText(choice.text)}
                    data-state={isCorrect ? "correct" : "idle"}
                    className={`rounded-[10px] border px-3 py-2 text-sm ${isCorrect ? "border-success bg-accent text-accent-foreground font-semibold" : "border-border text-foreground"}`}
                  >
                    {`${asText(choice.id)}. ${asText(choice.text)}`}
                  </li>
                )
              })}
            </ul>
            {revealAnswers && correct ? (
              <p className="mt-2 text-xs font-semibold text-muted-foreground">{`Correct choice: ${correct}`}</p>
            ) : null}
            {revealAnswers && asText(question.explanation) ? (
              <p className="mt-1 text-sm text-muted-foreground">{asText(question.explanation)}</p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * A read-only canvas: the stored elements at their stored positions.
 *
 * Styling is deliberately limited to what `canvas-styles` validates, and the
 * document is the same object the editor reads — so a preview can never show
 * something the editor would refuse.
 */
function CanvasPreview({ doc }: { doc: CanvasDoc }) {
  const elements = doc.elements.filter((element) => !element.hidden)
  return (
    <figure className="rounded-[12px] border border-border">
      <figcaption className="sr-only">{doc.name}</figcaption>
      <div className="max-h-[70vh] overflow-auto p-4">
        <div
          className="relative"
          style={{ width: doc.width, height: doc.height, background: safeColor(doc.background) || "#ffffff" }}
        >
          {elements.map((element) => (
            <CanvasPreviewElement key={element.id} element={element} />
          ))}
        </div>
      </div>
    </figure>
  )
}

function CanvasPreviewElement({ element }: { element: CanvasElement }) {
  const background = safeColor(element.style?.backgroundColor ?? element.style?.background)
  const color = safeColor(element.style?.color)
  const fontSize = safeNumber(element.style?.fontSize, 8, 200)
  const fontWeight = safeNumber(element.style?.fontWeight, 100, 900)
  const borderRadius = safeNumber(element.style?.borderRadius, 0, 96)
  const opacity = safeNumber(element.style?.opacity, 0.05, 1)
  const label = typeof element.style?.name === "string" && element.style.name.trim() ? element.style.name.trim() : element.content.slice(0, 60)
  const imageUrl = element.type === "image" ? sanitizeImageUrl(element.content) : null

  return (
    <div
      style={{
        position: "absolute",
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: "center",
        display: "flex",
        alignItems: element.type === "text" ? "flex-start" : "center",
        justifyContent: element.type === "text" ? "flex-start" : "center",
        overflow: "hidden",
        padding: 8,
        ...(background ? { background } : {}),
        ...(color ? { color } : {}),
        ...(fontSize === undefined ? {} : { fontSize }),
        ...(fontWeight === undefined ? {} : { fontWeight }),
        ...(borderRadius === undefined ? {} : { borderRadius }),
        ...(opacity === undefined ? {} : { opacity }),
      }}
    >
      {element.type === "image" ? (
        imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote sources are not known at build time
          <img src={imageUrl} alt={label || "Shared image"} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">Image</span>
        )
      ) : (
        <span className="whitespace-pre-wrap break-words">{element.content}</span>
      )}
    </div>
  )
}

"use client"

import { AlertTriangle, CheckCircle2, GripVertical, Info } from "lucide-react"
import { isSafeUrl, type QuizQuestion, type ThemedBlock, type ThemedCalloutTone, type ThemedTableAlign } from "@/lib/ai/format-response"
import { setBlockDragPayload } from "@/lib/studio/block-drop"

/**
 * Themed renderer for `format-response` blocks.
 *
 * One rule matters more than the styling: every text value is rendered as a
 * React text node. There is no `dangerouslySetInnerHTML` and no iframe here, so
 * even if the normalizer were bypassed, a reply could not become live markup.
 * The `format-response` test suite pins that property from the other side.
 *
 * The shape language follows the canvas editor's Takram-soft preset (see
 * `CANVAS_PRESET_CSS` in `views/canvas-editor.tsx`): the same radius/shadow
 * conventions reusing the app's semantic tokens, scoped to this component
 * instead of duplicating a stylesheet.
 */
const BLOCK_PRESET_CSS = `
.learn-blocks-soft {
  --blocks-radius: 14px;
  --blocks-radius-sm: 10px;
  --blocks-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 18px 40px -28px rgba(15, 23, 42, 0.35);
  --blocks-shadow-soft: 0 12px 28px -22px rgba(15, 23, 42, 0.4);
  --blocks-gap: 10px;
  display: grid;
  gap: var(--blocks-gap);
}
.learn-blocks-soft .learn-block {
  position: relative;
  border-radius: var(--blocks-radius);
  background: var(--card);
  color: var(--card-foreground);
  box-shadow: var(--blocks-shadow);
  padding: 12px 14px;
  transition: box-shadow 180ms ease;
}
.learn-blocks-soft .learn-block[data-draggable="true"]:hover {
  box-shadow: var(--blocks-shadow-soft);
}
.learn-blocks-soft .learn-block--heading {
  background: transparent;
  box-shadow: none;
  padding: 2px 2px 0;
}
.learn-blocks-soft .learn-block--divider {
  background: transparent;
  box-shadow: none;
  padding: 2px;
}
.learn-blocks-soft .learn-block--callout,
.learn-blocks-soft .learn-block--quote {
  border-left: 3px solid var(--primary);
  border-radius: var(--blocks-radius-sm);
  background: var(--muted);
  box-shadow: none;
}
.learn-blocks-soft .learn-block__handle {
  position: absolute;
  top: 6px;
  right: 4px;
  display: inline-flex;
  align-items: center;
  color: var(--muted-foreground);
  opacity: 0.35;
  cursor: grab;
  transition: opacity 160ms ease;
}
.learn-blocks-soft .learn-block:hover .learn-block__handle {
  opacity: 0.9;
}
.learn-blocks-soft .learn-block__heading {
  margin: 0;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--foreground);
}
.learn-blocks-soft .learn-block__heading[data-level="1"] { font-size: 1.4rem; }
.learn-blocks-soft .learn-block__heading[data-level="2"] { font-size: 1.2rem; }
.learn-blocks-soft .learn-block__heading[data-level="3"] { font-size: 1.05rem; }
.learn-blocks-soft .learn-block__heading[data-level="4"] { font-size: 0.95rem; }
.learn-blocks-soft .learn-block__paragraph,
.learn-blocks-soft .learn-block__quote {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.7;
}
.learn-blocks-soft .learn-block__list,
.learn-blocks-soft .learn-block__bullets,
.learn-blocks-soft .learn-block__choices {
  margin: 0;
  padding-left: 1.15rem;
  line-height: 1.7;
}
.learn-blocks-soft .learn-block__table-scroll,
.learn-blocks-soft .learn-block__code-scroll {
  overflow-x: auto;
  border-radius: var(--blocks-radius-sm);
}
.learn-blocks-soft .learn-block__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
}
.learn-blocks-soft .learn-block__table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 0.7rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.learn-blocks-soft .learn-block__cell {
  border-bottom: 1px solid var(--border);
  padding: 7px 9px;
  text-align: left;
  vertical-align: top;
}
.learn-blocks-soft .learn-block__cell--center { text-align: center; }
.learn-blocks-soft .learn-block__cell--right { text-align: right; }
.learn-blocks-soft .learn-block__code {
  margin: 0;
  padding: 12px;
  background: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8rem;
  line-height: 1.6;
  white-space: pre;
}
.learn-blocks-soft .learn-block__code-body {
  font-family: inherit;
}
.learn-blocks-soft .learn-block__code-language {
  display: inline-block;
  margin-bottom: 6px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-foreground);
  padding: 1px 8px;
  font-size: 0.65rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.learn-blocks-soft .learn-block__image {
  display: block;
  max-width: 100%;
  border-radius: var(--blocks-radius-sm);
}
.learn-blocks-soft .learn-block__divider {
  margin: 0;
  border: 0;
  border-top: 1px solid var(--border);
}
.learn-blocks-soft .learn-block__callout,
.learn-blocks-soft .learn-block__quiz-title,
.learn-blocks-soft .learn-block__deck-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 650;
}
.learn-blocks-soft .learn-block__callout { line-height: 1.6; }
.learn-blocks-soft .learn-block--callout-warn { border-left-color: var(--warning); }
.learn-blocks-soft .learn-block--callout-success { border-left-color: var(--success); }
.learn-blocks-soft .learn-block__questions { display: grid; gap: 10px; margin: 0; padding-left: 1.1rem; }
.learn-blocks-soft .learn-block__question-text { margin: 0; font-weight: 600; }
.learn-blocks-soft .learn-block__choice[data-state="correct"] {
  border-radius: var(--blocks-radius-sm);
  background: var(--accent);
  color: var(--accent-foreground);
  font-weight: 600;
}
.learn-blocks-soft .learn-block__answer,
.learn-blocks-soft .learn-block__explanation { margin: 4px 0 0; font-size: 0.82rem; color: var(--muted-foreground); }
.learn-blocks-soft .learn-block__slides { display: grid; gap: 10px; margin: 0; padding-left: 1.1rem; }
.learn-blocks-soft .learn-block__slide-title { margin: 0; font-weight: 600; }
.learn-blocks-soft .learn-block__bullets { margin-top: 4px; }
`

export interface AiBlockRendererProps {
  blocks: ThemedBlock[]
  className?: string
  /**
   * Makes each block itself draggable. The handle in the corner is always a
   * drag hook (`draggable` + `data-block-id`); this additionally marks the whole
   * surface, which is what a canvas would want once it accepts the drop.
   */
  draggable?: boolean
  onBlockDragStart?: (blockId: string, index: number) => void
}

/** Stable, deterministic id for a block's position in the list. */
export function aiBlockId(block: ThemedBlock, index: number): string {
  return `ai-block-${index}-${block.type}`
}

/**
 * Every drag out of this renderer carries the block itself plus its index, read
 * back by a drop target through `@/lib/studio/block-drop`. Setting it on both
 * the grip and (when `draggable`) the block surface means whichever the pointer
 * grabbed starts a drag a canvas can accept.
 */
function startBlockDrag(event: React.DragEvent<HTMLElement>, block: ThemedBlock, index: number) {
  setBlockDragPayload(event.dataTransfer, block, index)
}

export function AiBlockRenderer({ blocks, className, draggable = false, onBlockDragStart }: AiBlockRendererProps) {
  if (!blocks.length) return null

  return (
    <div className={`learn-blocks-soft ${className || ""}`.trim()}>
      <style>{BLOCK_PRESET_CSS}</style>
      {blocks.map((block, index) => {
        const blockId = aiBlockId(block, index)
        return (
          <section
            key={blockId}
            className={`learn-block learn-block--${block.type}`}
            data-block-id={blockId}
            data-block-type={block.type}
            data-block-index={index}
            data-draggable={draggable ? "true" : "false"}
            draggable={draggable || undefined}
            onDragStart={(event) => {
              startBlockDrag(event, block, index)
              onBlockDragStart?.(blockId, index)
            }}
          >
            <span
              className="learn-block__handle"
              data-block-id={blockId}
              draggable
              aria-hidden="true"
              title="Drag block"
              onDragStart={(event) => startBlockDrag(event, block, index)}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
            <BlockBody block={block} />
          </section>
        )
      })}
    </div>
  )
}

function BlockBody({ block }: { block: ThemedBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <p className="learn-block__heading" data-level={block.level} role="heading" aria-level={block.level}>
          {block.text}
        </p>
      )
    case "paragraph":
      return <p className="learn-block__paragraph">{block.text}</p>
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul"
      return (
        <ListTag className="learn-block__list" data-ordered={block.ordered ? "true" : "false"}>
          {block.items.map((item, index) => <li key={index}>{item}</li>)}
        </ListTag>
      )
    }
    case "table":
      return <BlockTable headers={block.headers} rows={block.rows} align={block.align} />
    case "code":
      return (
        <div className="learn-block__code-scroll">
          {block.language ? <span className="learn-block__code-language">{block.language}</span> : null}
          <pre className="learn-block__code">
            <code className="learn-block__code-body" data-language={block.language}>{block.code}</code>
          </pre>
        </div>
      )
    case "quote":
      return <blockquote className="learn-block__quote">{block.text}</blockquote>
    case "divider":
      return <hr className="learn-block__divider" />
    case "image":
      // Re-validated here too: an unsafe URL never reaches an `src` attribute.
      if (!isSafeUrl(block.url)) return <p className="learn-block__paragraph">{block.alt}</p>
      return (
        // eslint-disable-next-line @next/next/no-img-element -- remote AI-provided sources are not known at build time
        <img className="learn-block__image" src={block.url} alt={block.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      )
    case "callout":
      return <BlockCallout tone={block.tone} text={block.text} />
    case "quiz":
      return (
        <div>
          {block.title ? <p className="learn-block__quiz-title">{block.title}</p> : null}
          <ol className="learn-block__questions">
            {block.questions.map((question, index) => (
              <li key={`${index}-${question.question}`}>
                <BlockQuestion question={question} />
              </li>
            ))}
          </ol>
        </div>
      )
    case "slideOutline":
      return (
        <div>
          {block.title ? <p className="learn-block__deck-title">{block.title}</p> : null}
          <ol className="learn-block__slides">
            {block.slides.map((slide, index) => (
              <li key={`${index}-${slide.title}`}>
                <p className="learn-block__slide-title">{`Slide ${index + 1}: ${slide.title}`}</p>
                <ul className="learn-block__bullets">
                  {slide.bullets.map((bullet, bulletIndex) => <li key={`${bulletIndex}-${bullet}`}>{bullet}</li>)}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )
    default:
      return null
  }
}

function BlockTable({ headers, rows, align }: { headers: string[]; rows: string[][]; align?: ThemedTableAlign[] }) {
  return (
    <div className="learn-block__table-scroll">
      <table className="learn-block__table">
        <thead>
          <tr>
            {headers.map((header, column) => (
              <th key={`${column}-${header}`} className={cellClass("learn-block__cell", align?.[column])} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, column) => (
                <td key={column} className={cellClass("learn-block__cell", align?.[column])}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function cellClass(base: string, align: ThemedTableAlign | undefined): string {
  if (align === "center") return `${base} learn-block__cell--center`
  if (align === "right") return `${base} learn-block__cell--right`
  return base
}

const calloutIcons: Record<ThemedCalloutTone, React.ComponentType<{ className?: string }>> = {
  info: Info,
  warn: AlertTriangle,
  success: CheckCircle2,
}

function BlockCallout({ tone, text }: { tone: ThemedCalloutTone; text: string }) {
  const Icon = calloutIcons[tone] || Info
  return (
    <p className={`learn-block__callout learn-block__callout--${tone}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span>{text}</span>
    </p>
  )
}

function BlockQuestion({ question }: { question: QuizQuestion }) {
  return (
    <>
      <p className="learn-block__question-text">{question.question}</p>
      <ul className="learn-block__choices">
        {question.choices.map((choice) => (
          <li
            key={choice.id}
            className="learn-block__choice"
            data-choice-id={choice.id}
            data-state={question.answerId === choice.id ? "correct" : "idle"}
          >
            {`${choice.id}. ${choice.text}`}
          </li>
        ))}
      </ul>
      {question.answerId ? <p className="learn-block__answer">{`Answer: ${question.answerId}`}</p> : null}
      {question.explanation ? <p className="learn-block__explanation">{question.explanation}</p> : null}
    </>
  )
}

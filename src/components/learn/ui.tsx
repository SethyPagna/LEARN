import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react"
import { Info } from "lucide-react"
import { controlButtonClasses, statusToneClasses, type UiControlSize, type UiTone } from "@/lib/design-system"
import { Buddy } from "./buddy"
import { KindArt, type ArtKind } from "./kind-art"

/**
 * Shared dropdown-menu contract for the learn views.
 *
 * `SocialMenu` (ecosystem-views) and `ChatMenu` (productivity-views) are two
 * deliberately different menus — a compact record filter and a chat composer
 * action — but callers pass them the same props. The contract lives here so a
 * new prop (or a widened id union) reaches both menus at once instead of
 * drifting into two copies again.
 */
export interface ViewMenuProps<Id extends string> {
  align?: "left" | "right"
  children: ReactNode
  compact?: boolean
  icon: ComponentType<{ className?: string }>
  label: string
  menuId: Id
  openMenu: Id | null
  setOpenMenu: (menuId: Id | null) => void
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`learn-panel rounded-lg border border-border bg-card text-card-foreground ${className}`}>{children}</section>
}

/**
 * A friendly empty place: the buddy, or the drawing of a kind of work in its
 * colour, with one short line. Any longer explanation waits behind the info
 * button, and `action` offers the next step. `bare` drops the frame for
 * spots that already sit inside a card.
 */
export function EmptyState({ title, body, kind, action, bare }: { title: string; body?: string; kind?: ArtKind; action?: ReactNode; bare?: boolean }) {
  return (
    <div className="empty-state" data-bare={bare || undefined} data-project-kind={kind}>
      {kind ? <span className="empty-state-art"><KindArt kind={kind} /></span> : <Buddy mood="curious" size={64} label="" />}
      <p className="font-semibold text-foreground">{title}</p>
      {body ? <details className="inline-help"><summary aria-label="More information" title="More information"><Info className="h-4 w-4" /></summary><p className="mt-2 max-w-sm leading-5 text-muted-foreground">{body}</p></details> : null}
      {action}
    </div>
  )
}

export function StatusMessage({ message }: { message: string }) {
  return <div role="status" className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">{message}</div>
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: UiTone }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusToneClasses(tone)}`}>{label}</span>
}

export function ControlButton({
  active,
  children,
  destructive,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  destructive?: boolean
  size?: UiControlSize
}) {
  return (
    <button {...props} className={`${controlButtonClasses({ active, destructive, size })} ${props.className || ""}`}>
      {children}
    </button>
  )
}

import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react"
import { Inbox, Info } from "lucide-react"
import { controlButtonClasses, statusToneClasses, type UiControlSize, type UiTone } from "@/lib/design-system"

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

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="visual-empty rounded-lg border border-dashed border-border bg-card px-5 py-8 text-center text-sm">
      <Inbox aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-primary/60" />
      <p className="font-semibold text-foreground">{title}</p>
      <details className="inline-help mt-2"><summary aria-label="More information" title="More information"><Info className="h-4 w-4" /></summary><p className="mt-2 max-w-sm leading-5 text-muted-foreground">{body}</p></details>
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

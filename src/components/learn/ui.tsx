import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react"
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
  return <section className={`rounded-xl border border-border bg-card text-card-foreground shadow-paper ${className}`}>{children}</section>
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 leading-5 text-muted-foreground">{body}</p>
    </div>
  )
}

export function StatusMessage({ message }: { message: string }) {
  return <div role="status" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-paper">{message}</div>
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

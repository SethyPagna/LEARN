import type { ButtonHTMLAttributes, ReactNode } from "react"
import { controlButtonClasses, statusToneClasses, type UiControlSize, type UiTone } from "@/lib/design-system"

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-border bg-card text-card-foreground shadow-sm ${className}`}>{children}</section>
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/45 p-6 text-sm">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-2 leading-6 text-muted-foreground">{body}</p>
    </div>
  )
}

export function StatusMessage({ message }: { message: string }) {
  return <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">{message}</div>
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: UiTone }) {
  return <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${statusToneClasses(tone)}`}>{label}</span>
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

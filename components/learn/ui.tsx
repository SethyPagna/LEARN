import type { ReactNode } from "react"

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

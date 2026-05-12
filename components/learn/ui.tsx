import type { ReactNode } from "react"

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-[#d8dce2] bg-white ${className}`}>{children}</section>
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#cfd6df] bg-[#f7f9fb] p-6 text-sm">
      <p className="font-semibold text-[#17202a]">{title}</p>
      <p className="mt-2 leading-6 text-[#5e6a78]">{body}</p>
    </div>
  )
}

export function StatusMessage({ message }: { message: string }) {
  return <div className="rounded-lg border border-[#cfd6df] bg-white p-4 text-sm text-[#5e6a78]">{message}</div>
}

import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import Link from "next/link"
import { ArrowRight, CalendarDays, FileText, LayoutPanelLeft, Table2 } from "lucide-react"
import { SESSION_COOKIE } from "@/lib/data"
import { PublicIntroControls } from "@/components/public-intro-controls"

export default async function HomePage() {
  const cookieStore = await cookies()
  const signedIn = Boolean(cookieStore.get(SESSION_COOKIE)?.value)
  if (signedIn) redirect("/dashboard")

  return <main className="min-h-dvh bg-background text-foreground">
    <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8" aria-label="Public navigation">
      <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold"><img loading="eager" src="/icon.svg" alt="" width={32} height={32} />LEARN</Link>
      <PublicIntroControls signedIn={signedIn} />
    </nav>
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-12 sm:px-8 sm:py-20 lg:grid-cols-[.9fr_1.1fr]">
      <div><p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">A space for your ideas</p><h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Make room for<br />what you’re learning.</h1><p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">Write, create, practise and plan. A personal workspace that keeps your projects and learning together.</p><div className="mt-7 flex items-center gap-4"><Link href="/login" className="editor-primary !px-4 !py-3">Open LEARN<ArrowRight className="h-4 w-4" /></Link><a href="#workflow" className="text-sm text-muted-foreground hover:text-foreground">How it works</a></div></div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-paper" aria-label="Example Studio workspace">
        <div className="flex items-center justify-between border-b border-border px-5 py-3 text-xs text-muted-foreground"><span>Studio</span><span>Example workspace</span></div>
        <div className="p-5 sm:p-7"><h2 className="text-lg font-semibold">Your projects</h2><p className="mt-1 text-xs text-muted-foreground">Everything starts with one idea.</p><div className="mt-5 divide-y divide-border">{[{ icon: FileText, title: "Ideas worth keeping", type: "Document" }, { icon: LayoutPanelLeft, title: "The bigger picture", type: "Canvas" }, { icon: Table2, title: "A little progress, every day", type: "Sheet" }, { icon: CalendarDays, title: "Time to focus", type: "Calendar" }].map(({icon: Icon, title, type}) => <div key={title} className="flex items-center gap-3 py-4"><Icon className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 text-sm font-medium">{title}</span><span className="text-xs text-muted-foreground">{type}</span></div>)}</div></div>
      </div>
    </section>
    <section id="workflow" className="mx-auto grid max-w-6xl gap-8 border-t border-border px-5 py-10 sm:grid-cols-3 sm:px-8">
      {[['01', 'Start with your work', 'Keep notes, documents, canvases, slides and sheets together in Studio.'], ['02', 'Make it make sense', 'Bring a source to your AI tutor, ask questions and turn ideas into practice.'], ['03', 'Keep moving forward', 'Review what you learn, plan your time and work with others.']].map(([step,title,body]) => <div key={step}><span className="text-xs text-muted-foreground">{step}</span><h2 className="mt-3 text-sm font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p></div>)}
    </section>
  </main>
}

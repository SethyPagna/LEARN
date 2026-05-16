import { cookies } from "next/headers"
import Link from "next/link"
import type React from "react"
import { ArrowRight, BookOpen, Brain, Layers3, Sparkles } from "lucide-react"
import { SESSION_COOKIE } from "@/lib/data"

export default async function HomePage() {
  const cookieStore = await cookies()
  const signedIn = Boolean(cookieStore.get(SESSION_COOKIE)?.value)

  return (
    <main className="min-h-screen overflow-hidden bg-[#050607] text-white">
      <section className="relative isolate flex min-h-screen items-center px-6 py-10 sm:px-10">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_25%_20%,rgba(96,165,250,0.22),transparent_28%),radial-gradient(circle_at_80%_15%,rgba(16,185,129,0.18),transparent_25%),linear-gradient(135deg,#050607_0%,#0b1020_52%,#050607_100%)]" />
        <div className="absolute left-1/2 top-12 -z-10 h-56 w-56 -translate-x-1/2 rounded-full border border-white/10 bg-white/5 blur-2xl motion-safe:animate-pulse" />

        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1fr_420px]">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/75 backdrop-blur">
              <Sparkles className="h-4 w-4 text-emerald-300" />
              Your private learning workspace
            </div>
            <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight sm:text-7xl">
              Build a vault for what you learn.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-white/68">
              Capture notes, shape them with AI, turn them into practice, and keep the next step clear.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={signedIn ? "/dashboard" : "/login"} className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-black transition hover:bg-emerald-100">
                {signedIn ? "Open workspace" : "Start learning"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className="inline-flex h-11 items-center rounded-md border border-white/15 px-4 text-sm font-semibold text-white/85 transition hover:bg-white/10">
                Sign in
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/40 backdrop-blur">
              <div className="grid gap-3">
                <IntroStep icon={BookOpen} label="Capture" value="Notes, docs, sheets, slides" />
                <IntroStep icon={Brain} label="Shape" value="AI cleanup, tutor, flashcards" delay="150ms" />
                <IntroStep icon={Layers3} label="Practice" value="Quizzes, reviews, progress loops" delay="300ms" />
              </div>
              <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/75">
                  Today
                  <span>Ready</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white/10">
                  <div className="h-full w-2/3 rounded-full bg-emerald-300" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function IntroStep({
  delay = "0ms",
  icon: Icon,
  label,
  value,
}: {
  delay?: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-3 transition hover:border-emerald-300/40 hover:bg-white/10 motion-safe:animate-pulse" style={{ animationDelay: delay }}>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-black">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-sm text-white/58">{value}</p>
      </div>
    </div>
  )
}

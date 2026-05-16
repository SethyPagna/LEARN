import { cookies } from "next/headers"
import Link from "next/link"
import type React from "react"
import { ArrowRight, BookOpen, Brain, GraduationCap, Layers3, Play, Sparkles } from "lucide-react"
import { SESSION_COOKIE } from "@/lib/data"
import { IntroWorkflow } from "@/components/intro-workflow"

export default async function HomePage() {
  const cookieStore = await cookies()
  const signedIn = Boolean(cookieStore.get(SESSION_COOKIE)?.value)

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#040506] text-white">
      <section className="relative isolate grid min-h-screen content-center px-5 py-4 sm:px-8">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_14%,rgba(96,165,250,0.22),transparent_28%),radial-gradient(circle_at_78%_20%,rgba(16,185,129,0.18),transparent_24%),linear-gradient(135deg,#040506_0%,#08111f_54%,#040506_100%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-emerald-400/10 to-transparent" />

        <nav className="mx-auto mb-5 flex w-full max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black shadow-lg shadow-emerald-300/10">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.18em]">LEARN</p>
              <p className="text-xs text-white/50">Vault to practice</p>
            </div>
          </div>
          <Link href={signedIn ? "/dashboard" : "/login"} className="inline-flex h-10 items-center gap-2 rounded-md border border-white/12 bg-white/8 px-3 text-sm font-semibold text-white/82 transition hover:border-emerald-300/45 hover:bg-white/14">
            {signedIn ? "Open workspace" : "Sign in"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>

        <div className="mx-auto grid w-full max-w-7xl items-center gap-6 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="intro-copy">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-sm text-emerald-100">
              <Sparkles className="h-4 w-4" />
              Launching your learning loop
            </div>
            <h1 className="mt-4 max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
              Learn once. Reuse it everywhere.
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-white/64">
              Capture, organize, practice, and return with a workspace that keeps your mind in motion.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={signedIn ? "/dashboard" : "/login"} className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-black transition hover:bg-emerald-100">
                {signedIn ? "Go to LEARN" : "Start learning"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="#workflow" className="inline-flex h-11 items-center gap-2 rounded-md border border-white/14 px-4 text-sm font-semibold text-white/82 transition hover:bg-white/10">
                <Play className="h-4 w-4" />
                View workflow
              </Link>
            </div>
            <div className="mt-6 grid max-w-xl grid-cols-3 gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/52">
              <span>Vault</span>
              <span>Studio</span>
              <span>Practice</span>
            </div>
          </div>

          <div className="intro-stage">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] p-3 shadow-2xl shadow-black/50 backdrop-blur">
              <div className="absolute right-6 top-5 z-20 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs font-semibold text-white/72">
                Live workspace preview
              </div>
              <div className="intro-product-stack">
                <ProductShot kind="studio" />
                <ProductShot kind="ai" />
                <ProductShot kind="practice" />
              </div>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes intro-rise {
            from { opacity: 0; transform: translateY(18px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes intro-float-one {
            0%, 100% { transform: translate3d(0, 0, 0) rotate(-2deg); opacity: 1; }
            50% { transform: translate3d(0, -12px, 0) rotate(-1deg); opacity: 0.96; }
          }
          @keyframes intro-float-two {
            0%, 100% { transform: translate3d(18px, 24px, 0) rotate(2deg); opacity: 0.82; }
            50% { transform: translate3d(18px, 8px, 0) rotate(1deg); opacity: 0.95; }
          }
          @keyframes intro-float-three {
            0%, 100% { transform: translate3d(-18px, 48px, 0) rotate(1deg); opacity: 0.68; }
            50% { transform: translate3d(-18px, 30px, 0) rotate(0deg); opacity: 0.86; }
          }
          .intro-copy, .intro-stage { animation: intro-rise 720ms ease-out both; }
          .intro-stage { animation-delay: 120ms; }
          .intro-product-stack { min-height: 430px; position: relative; }
          .intro-product-stack > article:nth-child(1) { animation: intro-float-one 7s ease-in-out infinite; left: 7%; top: 12%; z-index: 3; }
          .intro-product-stack > article:nth-child(2) { animation: intro-float-two 8s ease-in-out infinite; right: 3%; top: 4%; z-index: 2; }
          .intro-product-stack > article:nth-child(3) { animation: intro-float-three 9s ease-in-out infinite; left: 0; bottom: 4%; z-index: 1; }
          @media (prefers-reduced-motion: reduce) {
            .intro-copy, .intro-stage, .intro-product-stack > article { animation: none !important; }
          }
          @media (max-width: 1023px) {
            .intro-product-stack { min-height: 360px; }
          }
        `}</style>
      </section>
      <IntroWorkflow />
    </main>
  )
}

function ProductShot({ kind }: { kind: "studio" | "ai" | "practice" }) {
  if (kind === "ai") {
    return (
      <article className="absolute w-[72%] max-w-[390px] rounded-2xl border border-white/12 bg-[#0b111b]/95 p-4 shadow-2xl">
        <ShotHeader icon={Brain} title="AI tutor" meta="Task | Filters | Gateway" />
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          {["Task ready", "12 keys", "Quiz target"].map((item) => (
            <span key={item} className="rounded-lg border border-emerald-300/18 bg-emerald-300/8 px-2 py-2 text-emerald-100">{item}</span>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/6 p-3 text-sm leading-6 text-white/72">
          Generate a mixed quiz from my latest Studio notes with explanations.
        </div>
      </article>
    )
  }

  if (kind === "practice") {
    return (
      <article className="absolute w-[72%] max-w-[390px] rounded-2xl border border-white/12 bg-[#0a1018]/95 p-4 shadow-2xl">
        <ShotHeader icon={GraduationCap} title="Practice" meta="Timed loop" />
        <div className="mt-4 grid gap-2">
          {["Fill-in-the-blank", "Mistake retry", "Save to reviews"].map((item, index) => (
            <div key={item} className="flex items-center justify-between rounded-lg bg-white/7 px-3 py-2 text-sm text-white/72">
              <span>{item}</span>
              <span className="text-emerald-200">{index + 1}/3</span>
            </div>
          ))}
        </div>
      </article>
    )
  }

  return (
    <article className="absolute w-[76%] max-w-[430px] rounded-2xl border border-white/12 bg-[#eef5ff] p-4 text-slate-950 shadow-2xl">
      <ShotHeader dark icon={Layers3} title="Studio" meta="Docs | Sheets | Slides" />
      <div className="mt-4 flex gap-2">
        {["Style", "Text", "Insert", "Find"].map((item) => (
          <span key={item} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">{item}</span>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Notes studio</p>
        <h2 className="mt-2 text-2xl font-semibold">Database Indexing</h2>
        <div className="mt-3 h-2 w-2/3 rounded bg-emerald-300" />
        <div className="mt-2 h-2 w-1/2 rounded bg-sky-200" />
      </div>
    </article>
  )
}

function ShotHeader({
  dark,
  icon: Icon,
  meta,
  title,
}: {
  dark?: boolean
  icon: React.ComponentType<{ className?: string }>
  meta: string
  title: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${dark ? "bg-slate-950 text-white" : "bg-white text-black"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className={`text-sm font-semibold ${dark ? "text-slate-950" : "text-white"}`}>{title}</p>
        <p className={`text-xs ${dark ? "text-slate-500" : "text-white/48"}`}>{meta}</p>
      </div>
    </div>
  )
}

import { cookies } from "next/headers"
import Link from "next/link"
import { ArrowRight, BookOpen, Brain, GraduationCap, Layers3, Play, Sparkles } from "lucide-react"
import { SESSION_COOKIE } from "@/lib/data"
import { IntroWorkflow } from "@/components/intro-workflow"
import { PublicIntroControls } from "@/components/public-intro-controls"

export default async function HomePage() {
  const cookieStore = await cookies()
  const signedIn = Boolean(cookieStore.get(SESSION_COOKIE)?.value)

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6faf7] text-slate-950 dark:bg-[#040506] dark:text-white">
      <section className="relative isolate grid min-h-screen content-center px-5 py-4 sm:px-8">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_14%,rgba(14,165,233,0.18),transparent_28%),radial-gradient(circle_at_78%_20%,rgba(16,185,129,0.16),transparent_24%),linear-gradient(135deg,#f8fbff_0%,#eaf7f0_54%,#f6faf7_100%)] dark:bg-[radial-gradient(circle_at_18%_14%,rgba(96,165,250,0.22),transparent_28%),radial-gradient(circle_at_78%_20%,rgba(16,185,129,0.18),transparent_24%),linear-gradient(135deg,#040506_0%,#08111f_54%,#040506_100%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-emerald-400/12 to-transparent" />

        <nav className="mx-auto mb-5 flex w-full max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-lg shadow-emerald-300/10 dark:bg-white dark:text-black">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.18em]">LEARN</p>
              <p className="text-xs text-slate-500 dark:text-white/50">Vault to practice</p>
            </div>
          </div>
          <PublicIntroControls signedIn={signedIn} />
        </nav>

        <div className="mx-auto grid w-full max-w-7xl items-center gap-6 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="intro-copy">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100">
              <Sparkles className="h-4 w-4" />
              Notes, AI, practice, and review in one loop
            </div>
            <h1 className="mt-4 max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
              Capture what you learn. Turn it into practice.
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-slate-600 dark:text-white/64">
              LEARN is a personal study workspace where notes, docs, AI tutoring, quizzes, reviews, and your calendar stay connected.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={signedIn ? "/dashboard" : "/login"} className="inline-flex h-11 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 dark:bg-white dark:text-black dark:hover:bg-emerald-100">
                {signedIn ? "Go to LEARN" : "Start learning"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="#workflow" className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-300/80 bg-white/50 px-4 text-sm font-semibold text-slate-800 transition hover:bg-white dark:border-white/14 dark:bg-transparent dark:text-white/82 dark:hover:bg-white/10">
                <Play className="h-4 w-4" />
                View workflow
              </Link>
            </div>
            <div className="mt-6 grid max-w-xl grid-cols-2 gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/58 sm:grid-cols-4">
              {["Capture", "Organize", "Practice", "Remember"].map((step) => (
                <span key={step} className="rounded-full border border-slate-300/70 bg-white/50 px-3 py-2 text-center dark:border-white/10 dark:bg-white/[0.045]">{step}</span>
              ))}
            </div>
          </div>

          <div className="intro-stage">
            <LearningLoopPreview />
          </div>
        </div>

        <style>{`
          @keyframes intro-rise {
            from { opacity: 0; transform: translateY(18px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes intro-scan {
            0%, 100% { transform: translateX(-18%); opacity: 0.36; }
            50% { transform: translateX(18%); opacity: 0.72; }
          }
          .intro-copy, .intro-stage { animation: intro-rise 720ms ease-out both; }
          .intro-stage { animation-delay: 120ms; }
          .intro-loop-scan { animation: intro-scan 6s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .intro-copy, .intro-stage, .intro-loop-scan { animation: none !important; }
          }
        `}</style>
      </section>
      <IntroWorkflow />
    </main>
  )
}

function LearningLoopPreview() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] p-3 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/60 to-transparent" />
      <div className="intro-loop-scan pointer-events-none absolute left-8 right-8 top-24 h-24 rounded-full bg-emerald-300/15 blur-3xl" />
      <div className="relative rounded-2xl border border-white/10 bg-[#07101b]/92 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Learning loop</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">From idea to memory</h2>
          </div>
          <span className="rounded-full border border-emerald-200/20 bg-emerald-200/10 px-3 py-1 text-xs font-semibold text-emerald-100">Live preview</span>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl bg-[#eef5ff] p-4 text-slate-950">
            <div className="flex flex-wrap items-center gap-2">
              {["Style", "Text", "Insert", "Find"].map((item) => (
                <span key={item} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">{item}</span>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <Layers3 className="h-4 w-4 text-sky-500" />
                Studio note
              </div>
              <h3 className="mt-2 text-3xl font-semibold">Database Indexing</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">B-tree indexes help range queries. Hash indexes are best for exact matches.</p>
              <div className="mt-4 grid gap-2">
                <div className="h-2 w-4/5 rounded bg-emerald-300" />
                <div className="h-2 w-3/5 rounded bg-sky-200" />
              </div>
            </div>
          </section>

          <section className="grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black">
                  <Brain className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">AI Tutor</p>
                  <p className="text-xs text-white/48">Turns the note into questions</p>
                </div>
              </div>
              <p className="mt-4 rounded-xl bg-black/28 p-3 text-sm leading-6 text-white/72">Generate a mixed quiz with explanations and save misses to review.</p>
            </div>

            <div className="rounded-2xl border border-emerald-200/16 bg-emerald-200/8 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-200 text-slate-950">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Practice</p>
                  <p className="text-xs text-white/48">Reviews remember what you missed</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {["Quiz ready", "Mistakes tracked", "Next review scheduled"].map((item) => (
                  <span key={item} className="rounded-lg bg-black/24 px-3 py-2 text-sm font-semibold text-emerald-100">{item}</span>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white/56">
          {["Capture", "Clean", "Quiz", "Review"].map((item) => (
            <span key={item} className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-2">{item}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

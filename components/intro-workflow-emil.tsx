"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  FileText,
  GraduationCap,
  Layers3,
  MessageSquare,
  Sparkles,
} from "lucide-react"

type IntroSlide = {
  accent: "emerald" | "sky" | "violet" | "amber"
  body: string
  chips: string[]
  icon: React.ComponentType<{ className?: string }>
  key: string
  metric: string
  route: string
  title: string
}

const introSlides: IntroSlide[] = [
  {
    accent: "emerald",
    body: "Capture notes, links, files, and a quick reflection without deciding the final format first.",
    chips: ["Draft safe", "Private by default", "One tap capture"],
    icon: FileText,
    key: "capture",
    metric: "00:18",
    route: "Capture",
    title: "Start with the thought.",
  },
  {
    accent: "sky",
    body: "Open the same material in Studio, then shape it as a note, doc, sheet, slide, or canvas project.",
    chips: ["Templates", "Canvas tools", "Export ready"],
    icon: Layers3,
    key: "studio",
    metric: "3 tools",
    route: "Studio",
    title: "Shape it into something useful.",
  },
  {
    accent: "violet",
    body: "Give AI the task, source, output target, and insert-back destination before it writes.",
    chips: ["Prompt preview", "Gateway ready", "Insert back"],
    icon: Bot,
    key: "ai",
    metric: "12 ready",
    route: "AI tutor",
    title: "Ask with context, not guesses.",
  },
  {
    accent: "amber",
    body: "Turn the result into quiz rounds, flashcards, timed games, and scheduled review cards.",
    chips: ["Quiz", "Mistakes", "Reviews"],
    icon: GraduationCap,
    key: "practice",
    metric: "8 reps",
    route: "Practice",
    title: "Practice until it sticks.",
  },
]

const accentClasses: Record<IntroSlide["accent"], {
  bar: string
  dot: string
  ring: string
  soft: string
  text: string
}> = {
  amber: {
    bar: "bg-amber-400",
    dot: "bg-amber-300",
    ring: "ring-amber-300/45",
    soft: "bg-amber-300/14 text-amber-900 dark:text-amber-100",
    text: "text-amber-700 dark:text-amber-200",
  },
  emerald: {
    bar: "bg-emerald-400",
    dot: "bg-emerald-300",
    ring: "ring-emerald-300/45",
    soft: "bg-emerald-300/14 text-emerald-900 dark:text-emerald-100",
    text: "text-emerald-700 dark:text-emerald-200",
  },
  sky: {
    bar: "bg-sky-400",
    dot: "bg-sky-300",
    ring: "ring-sky-300/45",
    soft: "bg-sky-300/14 text-sky-900 dark:text-sky-100",
    text: "text-sky-700 dark:text-sky-200",
  },
  violet: {
    bar: "bg-violet-400",
    dot: "bg-violet-300",
    ring: "ring-violet-300/45",
    soft: "bg-violet-300/14 text-violet-900 dark:text-violet-100",
    text: "text-violet-700 dark:text-violet-200",
  },
}

export function IntroWorkflowEmil() {
  const [activeIndex, setActiveIndex] = useState(0)
  const sectionRef = useRef<HTMLElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const activeSlide = introSlides[activeIndex] || introSlides[0]
  const accent = accentClasses[activeSlide.accent]
  const ActiveIcon = activeSlide.icon

  useEffect(() => {
    function update() {
      rafRef.current = null
      const section = sectionRef.current
      if (!section) return
      const rect = section.getBoundingClientRect()
      const scrollable = Math.max(1, rect.height - window.innerHeight)
      const progress = Math.min(1, Math.max(0, -rect.top / scrollable))
      const nextIndex = Math.min(introSlides.length - 1, Math.floor(progress * introSlides.length))
      setActiveIndex((current) => (current === nextIndex ? current : nextIndex))
    }

    function requestUpdate() {
      if (rafRef.current) return
      rafRef.current = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener("scroll", requestUpdate, { passive: true })
    window.addEventListener("resize", requestUpdate)
    return () => {
      window.removeEventListener("scroll", requestUpdate)
      window.removeEventListener("resize", requestUpdate)
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
    }
  }, [])

  function moveToSlide(index: number) {
    const section = sectionRef.current
    if (!section) return
    const top = section.getBoundingClientRect().top + window.scrollY
    const scrollable = Math.max(1, section.offsetHeight - window.innerHeight)
    const target = top + scrollable * ((index + 0.5) / introSlides.length)
    window.scrollTo({ top: target, behavior: "smooth" })
  }

  return (
    <section id="workflow" ref={sectionRef} className="relative min-h-[285svh] bg-[#eef7f1] text-slate-950 dark:bg-[#050706] dark:text-white">
      <div className="sticky top-0 grid min-h-screen overflow-hidden px-5 py-5 sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(16,185,129,0.18),transparent_28%),radial-gradient(circle_at_84%_24%,rgba(14,165,233,0.16),transparent_24%),linear-gradient(180deg,#f7fbff_0%,#eef7f1_58%,#f8fbff_100%)] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(16,185,129,0.2),transparent_28%),radial-gradient(circle_at_84%_24%,rgba(96,165,250,0.18),transparent_24%),linear-gradient(180deg,#050706_0%,#08121f_58%,#050706_100%)]" />
        <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-rows-[auto_1fr_auto] gap-5">
          <div className="flex items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/72 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white/55">
              <Sparkles className={`h-3.5 w-3.5 ${accent.text}`} />
              Workflow
            </div>
            <a href="/intro-classic" className="rounded-full border border-slate-300/70 bg-white/72 px-3 py-1 text-xs font-semibold text-slate-600 transition-[border-color,background-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white/58 dark:hover:border-emerald-300/50">
              Classic version
            </a>
          </div>

          <div className="grid min-h-0 items-center gap-5 lg:grid-cols-[0.78fr_1.22fr]">
            <div className="max-w-xl">
              <div className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold ${accent.soft}`}>
                <ActiveIcon className="h-4 w-4" />
                {activeSlide.route}
              </div>
              <h2 className="mt-5 text-balance text-4xl font-semibold leading-[0.98] tracking-tight sm:text-6xl">
                {activeSlide.title}
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-slate-600 dark:text-white/62">
                {activeSlide.body}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {activeSlide.chips.map((chip) => (
                  <span key={chip} className="rounded-full border border-slate-300/70 bg-white/64 px-3 py-1 text-sm font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.055] dark:text-white/68">
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            <div key={activeSlide.key} className="intro-emil-screen">
              <WorkflowPreview slide={activeSlide} />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/90 dark:bg-white/10">
              <div className={`h-full ${accent.bar} transition-[width] duration-200 ease-out`} style={{ width: `${((activeIndex + 1) / introSlides.length) * 100}%` }} />
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              {introSlides.map((slide, index) => {
                const Icon = slide.icon
                const active = index === activeIndex
                const itemAccent = accentClasses[slide.accent]
                return (
                  <button
                    key={slide.key}
                    type="button"
                    onClick={() => moveToSlide(index)}
                    className={`group flex min-w-0 items-center gap-3 rounded-2xl border p-2.5 text-left transition-[border-color,background-color,transform,box-shadow] duration-150 ease-out active:scale-[0.98] ${
                      active
                        ? `border-transparent bg-slate-950 text-white shadow-xl shadow-slate-900/15 ring-2 ${itemAccent.ring} dark:bg-white dark:text-black`
                        : "border-slate-300/70 bg-white/62 text-slate-700 hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-white/[0.045] dark:text-white/68 dark:hover:bg-white/[0.075]"
                    }`}
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? itemAccent.dot : "bg-slate-100 dark:bg-white/10"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{slide.route}</span>
                      <span className={`block truncate text-xs ${active ? "text-white/62 dark:text-black/52" : "text-slate-400 dark:text-white/42"}`}>{slide.metric}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes intro-emil-screen {
          from { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.985); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        .intro-emil-screen {
          animation: intro-emil-screen 280ms cubic-bezier(0.23, 1, 0.32, 1) both;
          contain: layout paint;
          transform: translateZ(0);
        }
        @media (prefers-reduced-motion: reduce) {
          .intro-emil-screen { animation: none !important; }
        }
      `}</style>
    </section>
  )
}

function WorkflowPreview({ slide }: { slide: IntroSlide }) {
  if (slide.key === "capture") return <CapturePreview />
  if (slide.key === "studio") return <StudioPreview />
  if (slide.key === "ai") return <AiPreview />
  return <PracticePreview />
}

function PreviewFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/14 bg-white/70 p-3 shadow-2xl shadow-slate-950/18 backdrop-blur-xl dark:bg-white/[0.065] dark:shadow-black/45">
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-white px-3 py-2 dark:bg-black/35">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-rose-400" />
          <span className="h-3 w-3 rounded-full bg-amber-300" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
        </div>
        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white dark:bg-white dark:text-black">{label}</span>
      </div>
      {children}
    </div>
  )
}

function CapturePreview() {
  return (
    <PreviewFrame label="Vault">
      <div className="grid gap-3 lg:grid-cols-[0.75fr_1.25fr]">
        <aside className="rounded-2xl bg-slate-950 p-3 text-white">
          {["Today", "Quick note", "Files", "Calendar"].map((item, index) => (
            <div key={item} className={`mb-2 rounded-xl px-3 py-2 text-sm font-semibold ${index === 1 ? "bg-emerald-300 text-slate-950" : "bg-white/8 text-white/72"}`}>{item}</div>
          ))}
        </aside>
        <section className="rounded-2xl bg-white p-4 text-slate-950 dark:bg-slate-50">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">New capture</p>
          <h3 className="mt-2 text-3xl font-semibold">Database Indexing</h3>
          <p className="mt-3 leading-7 text-slate-600">B-tree indexes help range queries. Save this as a note, then turn it into practice.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {["Note", "Quiz", "Review"].map((item) => <span key={item} className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{item}</span>)}
          </div>
        </section>
      </div>
    </PreviewFrame>
  )
}

function StudioPreview() {
  return (
    <PreviewFrame label="Studio">
      <div className="rounded-2xl bg-[#edf2f7] p-4 text-slate-950">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-2xl bg-white p-2 shadow-lg">
          {["Font", "Size", "Color", "Animate", "Position"].map((item, index) => (
            <span key={item} className={`rounded-xl px-3 py-2 text-xs font-semibold ${index === 2 ? "bg-sky-100 text-sky-900" : "bg-slate-50 text-slate-600"}`}>{item}</span>
          ))}
        </div>
        <div className="mx-auto aspect-[16/9] max-w-2xl rounded-xl bg-gradient-to-br from-slate-100 to-slate-300 p-8 shadow-xl">
          <div className="h-28 w-28 rounded-full bg-slate-700/80" />
          <h3 className="-mt-16 ml-24 max-w-lg text-4xl font-bold uppercase tracking-tight text-white drop-shadow">AI driven learning workspace</h3>
          <p className="ml-24 mt-4 text-lg text-slate-900">One canvas for notes, docs, sheets, and slides.</p>
        </div>
      </div>
    </PreviewFrame>
  )
}

function AiPreview() {
  return (
    <PreviewFrame label="AI Tutor">
      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        <section className="rounded-2xl bg-white p-4 text-slate-950 dark:bg-slate-50">
          <div className="flex flex-wrap justify-end gap-2">
            {["Task: Quiz", "Filters", "Gateway"].map((item) => <span key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold">{item}</span>)}
          </div>
          <div className="mt-4 rounded-2xl bg-slate-100 p-4 text-slate-700">
            Generate a mixed quiz from the current Studio project. Use short explanations and save misses to review.
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-violet-50 p-3 text-sm font-semibold text-violet-900">
            <CheckCircle2 className="h-4 w-4" />
            Prompt preview ready
          </div>
        </section>
        <aside className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-sm font-semibold text-violet-200">Gateway</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {["12 keys", "7 families", "masked", "failover"].map((item) => <span key={item} className="rounded-xl bg-white/10 p-3 text-sm font-semibold">{item}</span>)}
          </div>
        </aside>
      </div>
    </PreviewFrame>
  )
}

function PracticePreview() {
  return (
    <PreviewFrame label="Practice">
      <div className="grid gap-3 lg:grid-cols-[1fr_250px]">
        <section className="rounded-2xl bg-[#32127a] p-5 text-white">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-bold">Live round</span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#32127a]">03:42</span>
          </div>
          <h3 className="mt-6 text-3xl font-semibold">Which index helps range queries?</h3>
          <div className="mt-5 grid gap-2">
            {["Hash index", "B-tree index", "Bitmap only"].map((item, index) => (
              <span key={item} className={`rounded-2xl p-3 text-sm font-semibold ${index === 1 ? "bg-emerald-300 text-slate-950" : "bg-white/12"}`}>{item}</span>
            ))}
          </div>
        </section>
        <aside className="rounded-2xl bg-white p-4 text-slate-950 dark:bg-slate-50">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-amber-500" />
            <p className="font-semibold">After round</p>
          </div>
          {["Explain mistakes", "Retry missed", "Schedule review"].map((item) => <div key={item} className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{item}</div>)}
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <CalendarDays className="h-4 w-4" />
            Next review today
          </div>
        </aside>
      </div>
    </PreviewFrame>
  )
}

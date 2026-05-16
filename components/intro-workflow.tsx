"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import {
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  FileText,
  GraduationCap,
  Layers3,
  MessageSquare,
  Sparkles,
} from "lucide-react"

const workflowSlides = [
  {
    key: "dashboard",
    step: "01",
    label: "Dashboard",
    title: "Start from the next useful move.",
    body: "A command center shows what to review, what is due, what needs repair, and what you last created.",
    icon: BarChart3,
    color: "emerald",
    signals: ["Today route ready", "2 weak topics", "Focus block at 7:30"],
  },
  {
    key: "studio",
    step: "02",
    label: "Studio",
    title: "Turn raw thinking into usable material.",
    body: "Notes, docs, sheets, and slides share one workspace with saved drafts, clean tools, and clear export actions.",
    icon: Layers3,
    color: "sky",
    signals: ["Draft saved", "3 panes open", "Slide outline ready"],
  },
  {
    key: "ai",
    step: "03",
    label: "AI Tutor",
    title: "Use AI with context instead of guessing prompts.",
    body: "Task, filters, gateway status, source material, and insert-back targets stay visible before you run a request.",
    icon: Bot,
    color: "violet",
    signals: ["12 providers ready", "Quiz target selected", "Prompt preview checked"],
  },
  {
    key: "practice",
    step: "04",
    label: "Practice",
    title: "Convert knowledge into reps.",
    body: "Quizzes, flashcards, timed sprints, retry loops, and explanations connect directly back to Studio and Reviews.",
    icon: GraduationCap,
    color: "amber",
    signals: ["8 questions", "4 min target", "Misses saved to review"],
  },
  {
    key: "calendar",
    step: "05",
    label: "Calendar",
    title: "Protect study time before it disappears.",
    body: "Month, day, agenda, review due dates, and focus blocks make learning visible in time, not just in lists.",
    icon: CalendarDays,
    color: "cyan",
    signals: ["3 due reviews", "45 min focus", "Timezone aware"],
  },
  {
    key: "social",
    step: "06",
    label: "Social",
    title: "Share when it helps, stay private by default.",
    body: "Spaces, rooms, chats, battles, and invites are grouped around learning, with private vault work still protected.",
    icon: MessageSquare,
    color: "rose",
    signals: ["Focus room live", "2 group notes", "Battle starts soon"],
  },
] as const

type WorkflowSlide = (typeof workflowSlides)[number]

const colorStyles: Record<WorkflowSlide["color"], { bg: string; text: string; line: string; chip: string }> = {
  amber: { bg: "bg-amber-300", text: "text-amber-200", line: "bg-amber-300", chip: "border-amber-200/30 bg-amber-200/10 text-amber-100" },
  cyan: { bg: "bg-cyan-300", text: "text-cyan-200", line: "bg-cyan-300", chip: "border-cyan-200/30 bg-cyan-200/10 text-cyan-100" },
  emerald: { bg: "bg-emerald-300", text: "text-emerald-200", line: "bg-emerald-300", chip: "border-emerald-200/30 bg-emerald-200/10 text-emerald-100" },
  rose: { bg: "bg-rose-300", text: "text-rose-200", line: "bg-rose-300", chip: "border-rose-200/30 bg-rose-200/10 text-rose-100" },
  sky: { bg: "bg-sky-300", text: "text-sky-200", line: "bg-sky-300", chip: "border-sky-200/30 bg-sky-200/10 text-sky-100" },
  violet: { bg: "bg-violet-300", text: "text-violet-200", line: "bg-violet-300", chip: "border-violet-200/30 bg-violet-200/10 text-violet-100" },
}

export function IntroWorkflow() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [overlayProgress, setOverlayProgress] = useState(0)
  const sectionRef = useRef<HTMLElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const activeSlide = workflowSlides[activeIndex]

  useEffect(() => {
    function updateActiveSlide() {
      rafRef.current = null
      const section = sectionRef.current
      if (!section) return
      const rect = section.getBoundingClientRect()
      const scrollable = Math.max(1, rect.height - window.innerHeight)
      const progress = Math.min(1, Math.max(0, -rect.top / scrollable))
      const revealProgress = Math.min(1, Math.max(0, (progress - 0.005) / 0.045))
      const easedReveal = revealProgress * revealProgress * (3 - 2 * revealProgress)
      const slideProgress = Math.min(1, Math.max(0, (progress - 0.1) / 0.9))
      const nextIndex = Math.min(workflowSlides.length - 1, Math.floor(slideProgress * workflowSlides.length))
      setOverlayProgress((current) => (Math.abs(current - easedReveal) < 0.01 ? current : easedReveal))
      setActiveIndex((current) => (current === nextIndex ? current : nextIndex))
    }

    function requestUpdate() {
      if (rafRef.current) return
      rafRef.current = window.requestAnimationFrame(updateActiveSlide)
    }

    updateActiveSlide()
    window.addEventListener("scroll", requestUpdate, { passive: true })
    window.addEventListener("resize", requestUpdate)
    return () => {
      window.removeEventListener("scroll", requestUpdate)
      window.removeEventListener("resize", requestUpdate)
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
    }
  }, [])

  function scrollToSlide(index: number) {
    const section = sectionRef.current
    if (!section) return
    const top = section.getBoundingClientRect().top + window.scrollY
    const scrollable = section.offsetHeight - window.innerHeight
    const target = top + scrollable * (0.1 + (index / workflowSlides.length) * 0.9)
    window.scrollTo({ top: target, behavior: "smooth" })
  }

  return (
    <section ref={sectionRef} className="pointer-events-none relative -mt-[100svh] min-h-[430svh] text-white">
      <span id="workflow" className="absolute top-[100svh]" aria-hidden="true" />
      <div
        data-workflow-overlay
        className="fixed inset-0 z-20 grid h-[100svh] overflow-hidden px-5 py-5 sm:px-8"
        style={{
          opacity: overlayProgress,
          pointerEvents: overlayProgress > 0.92 ? "auto" : "none",
          transform: `translate3d(0, ${(1 - overlayProgress) * 28}px, 0) scale(${0.98 + overlayProgress * 0.02})`,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_22%,rgba(16,185,129,0.18),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(96,165,250,0.15),transparent_22%),linear-gradient(180deg,#040506_0%,#07101b_48%,#040506_100%)]" />
        <div className="relative z-10 mx-auto grid h-full w-full max-w-7xl grid-rows-[auto_1fr_auto] gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/58">
              <Sparkles className="h-3.5 w-3.5 text-emerald-200" />
              Scroll workflow
            </div>
            <div className="hidden items-center gap-2 text-xs font-semibold text-white/46 sm:flex">
              <span>Hero</span>
              <span className="h-px w-8 bg-white/20" />
              <span>Workflow</span>
              <span className="h-px w-8 bg-white/20" />
              <span>Workspace</span>
            </div>
          </div>

          <div className="grid min-h-0 items-center gap-5 lg:grid-cols-[0.78fr_1.22fr]">
            <WorkflowCopy slide={activeSlide} />
            <div className="min-h-0">
              <div key={activeSlide.key} className="workflow-screen-motion">
                <WorkflowScreen slide={activeSlide} />
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full ${colorStyles[activeSlide.color].line} transition-all duration-500`} style={{ width: `${((activeIndex + 1) / workflowSlides.length) * 100}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
              {workflowSlides.map((slide, index) => {
                const Icon = slide.icon
                const active = index === activeIndex
                return (
                  <button
                    key={slide.key}
                    onClick={() => scrollToSlide(index)}
                    className={`group flex min-w-0 items-center gap-2 rounded-xl border p-2 text-left transition ${
                      active ? "border-white bg-white text-black shadow-xl shadow-black/30" : "border-white/10 bg-black/22 text-white hover:bg-white/8"
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-black text-white" : "bg-white/10 text-white"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">{slide.label}</span>
                      <span className={`block truncate text-[11px] ${active ? "text-black/52" : "text-white/42"}`}>{slide.step}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes workflow-screen-in {
          from { opacity: 0.2; transform: translate3d(0, 28px, 0) scale(0.985); filter: blur(5px); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
        }
        .workflow-screen-motion {
          animation: workflow-screen-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
          contain: layout paint;
          transform: translateZ(0);
        }
        @media (prefers-reduced-motion: reduce) {
          .workflow-screen-motion { animation: none !important; }
        }
      `}</style>
    </section>
  )
}

function WorkflowCopy({ slide }: { slide: WorkflowSlide }) {
  const Icon = slide.icon
  const colors = colorStyles[slide.color]
  return (
    <div className="min-w-0">
      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${colors.chip}`}>
        <Icon className="h-4 w-4" />
        {slide.step} / {workflowSlides.length.toString().padStart(2, "0")}
      </div>
      <h2 className="mt-4 max-w-2xl text-balance text-3xl font-semibold leading-[1.04] tracking-tight sm:mt-5 sm:text-6xl">{slide.title}</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-white/62 sm:mt-4 sm:text-lg sm:leading-8">{slide.body}</p>
      <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-semibold text-white/72 sm:hidden">
        <CheckCircle2 className={`h-4 w-4 ${colors.text}`} />
        <span>{slide.signals[0]}</span>
      </div>
      <div className="mt-6 hidden max-w-xl gap-2 sm:grid">
        {slide.signals.map((signal) => (
          <div key={signal} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-semibold text-white/72">
            <CheckCircle2 className={`h-4 w-4 ${colors.text}`} />
            <span>{signal}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WorkflowScreen({ slide }: { slide: WorkflowSlide }) {
  if (slide.key === "dashboard") return <DashboardScreen />
  if (slide.key === "studio") return <StudioScreen />
  if (slide.key === "ai") return <AiScreen />
  if (slide.key === "practice") return <PracticeScreen />
  if (slide.key === "calendar") return <CalendarScreen />
  return <SocialScreen />
}

function BrowserFrame({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="max-h-[42svh] overflow-hidden rounded-[28px] border border-white/12 bg-[#eaf2ff] p-3 text-slate-950 shadow-2xl shadow-black/45 sm:max-h-none">
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-rose-400" />
          <span className="h-3 w-3 rounded-full bg-amber-300" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
        </div>
        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">{title}</span>
      </div>
      {children}
    </div>
  )
}

function DashboardScreen() {
  return (
    <BrowserFrame title="Dashboard">
      <div className="grid gap-3 lg:grid-cols-[210px_1fr]">
        <aside className="hidden rounded-2xl bg-slate-950 p-3 text-white lg:block">
          {["Dashboard", "Learn", "Studio", "AI tutor", "Practice"].map((item, index) => (
            <div key={item} className={`mb-2 rounded-xl px-3 py-2 text-sm font-semibold ${index === 0 ? "bg-white text-slate-950" : "bg-white/8 text-white/70"}`}>{item}</div>
          ))}
        </aside>
        <section className="grid gap-3">
          <div className="rounded-2xl bg-slate-950 p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Today route</p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <h3 className="max-w-sm text-3xl font-semibold">Repair indexing, then quiz it.</h3>
              <span className="rounded-full bg-emerald-300 px-3 py-1 text-xs font-bold text-slate-950">33% complete</span>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {["Weak topics", "Studio recents", "Calendar agenda"].map((item, index) => (
              <div key={item} className="rounded-2xl bg-white p-4">
                <p className="text-sm font-semibold">{item}</p>
                <p className="mt-1 text-xs text-slate-500">{["B-trees, virtual memory", "3 files changed", "7:30 PM focus"][index]}</p>
                <div className="mt-4 h-2 rounded bg-slate-100">
                  <div className="h-2 rounded bg-emerald-300" style={{ width: `${70 - index * 12}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </BrowserFrame>
  )
}

function StudioScreen() {
  return (
    <BrowserFrame title="Studio">
      <div className="grid gap-3 lg:grid-cols-[190px_1fr_160px]">
        <aside className="hidden rounded-2xl bg-white p-3 lg:block">
          {["Database Indexing", "Memory Review", "Learning Deck"].map((item, index) => (
            <div key={item} className={`mb-2 rounded-xl border p-3 ${index === 0 ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-slate-50"}`}>
              <p className="text-sm font-semibold">{item}</p>
              <p className="mt-1 text-xs text-slate-500">{index === 2 ? "Slides" : "Notes"}</p>
            </div>
          ))}
        </aside>
        <section className="rounded-2xl bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {["Style", "Text", "Paragraph", "Insert", "Find"].map((item) => (
              <span key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold">{item}</span>
            ))}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Notes studio</p>
          <h3 className="mt-2 text-3xl font-semibold">Database Indexing</h3>
          <p className="mt-4 leading-7 text-slate-600">B-tree indexes reduce scan cost for range queries. Hash indexes are fast for exact matches.</p>
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">Saved locally 16:42 to synced</div>
        </section>
        <aside className="hidden rounded-2xl bg-slate-950 p-3 text-white lg:block">
          {["Info", "Outline", "AI", "Export"].map((item) => <div key={item} className="mb-2 rounded-lg bg-white/8 px-3 py-2 text-sm">{item}</div>)}
        </aside>
      </div>
    </BrowserFrame>
  )
}

function AiScreen() {
  return (
    <BrowserFrame title="AI Tutor">
      <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
        <section className="rounded-2xl bg-white p-4">
          <div className="flex justify-end gap-2">
            {["Task: Quiz", "Filters", "Gateway"].map((item) => <span key={item} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">{item}</span>)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {["Source: Studio", "Difficulty: Adaptive", "Output: Quiz", "Insert: Practice"].map((item) => (
              <span key={item} className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">{item}</span>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-slate-100 p-4 text-slate-700">Generate 8 mixed questions from the selected note. Include explanations and save missed answers to reviews.</div>
        </section>
        <aside className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-sm font-semibold text-emerald-200">Gateway</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {["12 ready", "7 families", "masked keys", "failover"].map((item) => <span key={item} className="rounded-xl bg-white/10 p-3 text-sm font-semibold">{item}</span>)}
          </div>
        </aside>
      </div>
    </BrowserFrame>
  )
}

function PracticeScreen() {
  return (
    <BrowserFrame title="Practice">
      <div className="grid gap-3 lg:grid-cols-[1fr_270px]">
        <section className="rounded-2xl bg-slate-950 p-5 text-white">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-200">Timed mixed quiz</p>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-950">03:42</span>
          </div>
          <h3 className="mt-5 text-3xl font-semibold">Which index helps range queries?</h3>
          <div className="mt-5 grid gap-2">
            {["Hash index", "B-tree index", "Bitmap only"].map((item, index) => (
              <span key={item} className={`rounded-xl p-3 text-sm font-semibold ${index === 1 ? "bg-emerald-300 text-slate-950" : "bg-white/10"}`}>{item}</span>
            ))}
          </div>
        </section>
        <aside className="rounded-2xl bg-white p-4">
          <p className="text-sm font-semibold">Attempt summary</p>
          {["6 correct", "2 missed", "Save misses to reviews"].map((item) => <div key={item} className="mt-3 rounded-xl bg-slate-100 p-3 text-sm font-semibold">{item}</div>)}
        </aside>
      </div>
    </BrowserFrame>
  )
}

function CalendarScreen() {
  return (
    <BrowserFrame title="Calendar">
      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        <section className="grid grid-cols-7 gap-2 rounded-2xl bg-white p-4">
          {Array.from({ length: 28 }, (_, index) => (
            <span key={index} className={`grid aspect-square place-items-center rounded-xl text-sm font-semibold ${[4, 11, 17, 22].includes(index) ? "bg-cyan-200 text-slate-950" : "bg-slate-100"}`}>{index + 1}</span>
          ))}
        </section>
        <aside className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-sm font-semibold text-cyan-200">Tonight</p>
          {["7:30 Review queue", "8:15 Studio cleanup", "9:00 Rest day note"].map((item) => <div key={item} className="mt-3 rounded-xl bg-white/10 p-3 text-sm">{item}</div>)}
        </aside>
      </div>
    </BrowserFrame>
  )
}

function SocialScreen() {
  return (
    <BrowserFrame title="Social">
      <div className="grid gap-3 lg:grid-cols-[230px_1fr]">
        <aside className="rounded-2xl bg-slate-950 p-4 text-white">
          {["Operating Systems", "Study room", "Quiz battle"].map((item) => <div key={item} className="mb-2 rounded-xl bg-white/10 p-3 text-sm font-semibold">{item}</div>)}
        </aside>
        <section className="rounded-2xl bg-white p-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="font-semibold">Operating Systems Circle</p>
              <p className="text-sm text-slate-500">Shared notes, calm rooms, and practice battles</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2">
            {["Mina added a virtual memory note", "Focus room has 4 learners", "Battle starts in 4 minutes"].map((item) => <span key={item} className="rounded-xl bg-slate-100 p-3 text-sm">{item}</span>)}
          </div>
        </section>
      </div>
    </BrowserFrame>
  )
}

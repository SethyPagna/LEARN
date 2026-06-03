"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Bot, FileText, GraduationCap, Layers3, Sparkles } from "lucide-react"

type IntroSlide = {
  accent: "emerald" | "sky" | "violet" | "amber"
  body: string
  chips: string[]
  icon: React.ComponentType<{ className?: string }>
  image: string
  imageAlt: string
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
    image: "/intro/workflow-dashboard.png",
    imageAlt: "Actual LEARN dashboard showing route, metrics, review queue, AI suggestion, recent work, and calendar agenda.",
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
    image: "/intro/workflow-studio.png",
    imageAlt: "Actual LEARN Studio project page with recent projects, templates, search, and design cards.",
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
    image: "/intro/workflow-ai.png",
    imageAlt: "Actual LEARN AI Tutor page with task, filters, gateway status, prompt box, and provider tools.",
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
    image: "/intro/workflow-practice.png",
    imageAlt: "Actual LEARN Practice page showing quiz questions, live game pin, timer, and practice actions.",
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
  const [overlayProgress, setOverlayProgress] = useState(0)
  const [scrollProgress, setScrollProgress] = useState(0)
  const sectionRef = useRef<HTMLElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const snapTimerRef = useRef<number | null>(null)
  const activeSlide = introSlides[activeIndex] || introSlides[0]
  const accent = accentClasses[activeSlide.accent]
  const ActiveIcon = activeSlide.icon
  const slideProgress = Math.min(1, Math.max(0, scrollProgress * introSlides.length - activeIndex))
  const stepLabel = `${String(activeIndex + 1).padStart(2, "0")} / ${String(introSlides.length).padStart(2, "0")}`

  useEffect(() => {
    const workflowRevealEnd = 0.18

    function getMetrics() {
      const section = sectionRef.current
      if (!section) return null
      const top = section.getBoundingClientRect().top + window.scrollY
      const scrollable = Math.max(1, section.offsetHeight - window.innerHeight)
      const progress = Math.min(1, Math.max(0, (window.scrollY - top) / scrollable))
      return { progress, scrollable, top }
    }

    function update() {
      rafRef.current = null
      const metrics = getMetrics()
      if (!metrics) return
      const revealProgress = Math.min(1, Math.max(0, metrics.progress / workflowRevealEnd))
      const easedReveal = revealProgress * revealProgress * (3 - 2 * revealProgress)
      const workflowProgress = Math.min(1, Math.max(0, (metrics.progress - workflowRevealEnd) / (1 - workflowRevealEnd)))
      const nextIndex = Math.min(introSlides.length - 1, Math.floor(workflowProgress * introSlides.length))
      setOverlayProgress((current) => (Math.abs(current - easedReveal) < 0.01 ? current : easedReveal))
      setScrollProgress((current) => (Math.abs(current - workflowProgress) < 0.003 ? current : workflowProgress))
      setActiveIndex((current) => (current === nextIndex ? current : nextIndex))
    }

    function snapToNearestSlide() {
      const metrics = getMetrics()
      if (!metrics) return
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      if (metrics.progress < workflowRevealEnd || metrics.progress > 0.985) return

      const workflowProgress = Math.min(1, Math.max(0, (metrics.progress - workflowRevealEnd) / (1 - workflowRevealEnd)))
      const index = Math.min(introSlides.length - 1, Math.max(0, Math.floor(workflowProgress * introSlides.length)))
      const targetProgress = workflowRevealEnd + ((index + 0.5) / introSlides.length) * (1 - workflowRevealEnd)
      const targetTop = metrics.top + metrics.scrollable * targetProgress
      if (Math.abs(window.scrollY - targetTop) < 28) return
      window.scrollTo({ top: targetTop, behavior: "smooth" })
    }

    function requestUpdate() {
      if (rafRef.current) return
      rafRef.current = window.requestAnimationFrame(update)
      if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current)
      snapTimerRef.current = window.setTimeout(snapToNearestSlide, 190)
    }

    update()
    window.addEventListener("scroll", requestUpdate, { passive: true })
    window.addEventListener("resize", requestUpdate)
    return () => {
      window.removeEventListener("scroll", requestUpdate)
      window.removeEventListener("resize", requestUpdate)
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
      if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current)
    }
  }, [])

  function moveToSlide(index: number) {
    const section = sectionRef.current
    if (!section) return
    const top = section.getBoundingClientRect().top + window.scrollY
    const scrollable = Math.max(1, section.offsetHeight - window.innerHeight)
    const target = top + scrollable * (0.18 + ((index + 0.5) / introSlides.length) * 0.82)
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    window.scrollTo({ top: target, behavior: reduceMotion ? "auto" : "smooth" })
  }

  return (
    <section ref={sectionRef} className="pointer-events-none relative -mt-[100svh] min-h-[430svh] text-slate-950 dark:text-white">
      <span id="workflow" className="absolute top-[100svh]" aria-hidden="true" />
      <div
        data-intro-workflow-overlay
        data-active-slide={activeSlide.key}
        className="fixed inset-0 z-20 grid h-[100svh] overflow-hidden px-3 py-3 sm:px-5 sm:py-4 lg:px-8 lg:py-5"
        style={{
          pointerEvents: overlayProgress > 0.9 ? "auto" : "none",
          visibility: overlayProgress > 0.01 ? "visible" : "hidden",
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(16,185,129,0.18),transparent_28%),radial-gradient(circle_at_84%_24%,rgba(14,165,233,0.16),transparent_24%),linear-gradient(180deg,#f7fbff_0%,#eef7f1_58%,#f8fbff_100%)] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(16,185,129,0.2),transparent_28%),radial-gradient(circle_at_84%_24%,rgba(96,165,250,0.18),transparent_24%),linear-gradient(180deg,#050706_0%,#08121f_58%,#050706_100%)]" />
        <div
          className="relative z-10 mx-auto grid h-full w-full max-w-[min(1760px,96vw)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 sm:gap-4 lg:gap-5"
          style={{
            opacity: overlayProgress,
            transform: `translate3d(0, ${(1 - overlayProgress) * 30}px, 0) scale(${0.982 + overlayProgress * 0.018})`,
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/72 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white/55">
              <Sparkles className={`h-3.5 w-3.5 ${accent.text}`} />
              Workflow
            </div>
            <a href="/intro-classic" className="hidden rounded-full border border-slate-300/70 bg-white/72 px-3 py-1 text-xs font-semibold text-slate-600 transition-[border-color,background-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-white active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-white/58 dark:hover:border-emerald-300/50 sm:inline-flex">
              Classic version
            </a>
          </div>

          <div className="grid min-h-0 content-center items-center gap-3 sm:gap-5 lg:grid-cols-[0.58fr_1.42fr] xl:grid-cols-[0.52fr_1.48fr]">
            <div className="max-w-xl self-center">
              <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                <div className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold ${accent.soft}`}>
                  <ActiveIcon className="h-4 w-4" />
                  {activeSlide.route}
                </div>
                <span className="rounded-2xl border border-slate-300/70 bg-white/64 px-3 py-2 text-sm font-semibold text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.055] dark:text-white/48">
                  {stepLabel}
                </span>
              </div>
              <h2 className="mt-3 text-balance text-2xl font-semibold leading-[0.98] tracking-tight sm:mt-5 sm:text-4xl lg:text-5xl xl:text-6xl">
                {activeSlide.title}
              </h2>
              <p className="mt-3 hidden max-w-lg text-sm leading-6 text-slate-600 dark:text-white/62 sm:block lg:mt-4 lg:text-base lg:leading-7">
                {activeSlide.body}
              </p>
              <div className="mt-4 hidden flex-wrap gap-2 sm:flex lg:mt-5">
                {activeSlide.chips.map((chip) => (
                  <span key={chip} className="rounded-full border border-slate-300/70 bg-white/64 px-3 py-1 text-sm font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.055] dark:text-white/68">
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            <div
              key={activeSlide.key}
              className="intro-emil-screen"
              style={{
                opacity: 0.92 + slideProgress * 0.08,
                transform: `translate3d(0, ${(1 - slideProgress) * 8}px, 0) scale(${0.992 + slideProgress * 0.008})`,
              }}
            >
              <WorkflowPreview slide={activeSlide} />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/90 dark:bg-white/10">
              <div className={`h-full ${accent.bar} transition-[width] duration-200 ease-out`} style={{ width: `${Math.max(4, scrollProgress * 100)}%` }} />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0">
              {introSlides.map((slide, index) => {
                const Icon = slide.icon
                const active = index === activeIndex
                const itemAccent = accentClasses[slide.accent]
                return (
                  <button
                    key={slide.key}
                    type="button"
                    onClick={() => moveToSlide(index)}
                    aria-current={active ? "step" : undefined}
                    className={`group flex min-w-[10.25rem] items-center gap-3 rounded-2xl border p-2.5 text-left transition-[border-color,background-color,transform,box-shadow] duration-150 ease-out active:scale-[0.98] sm:min-w-0 ${
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
                      <span className={`block truncate text-xs ${active ? "text-white/62 dark:text-black/52" : "text-slate-400 dark:text-white/42"}`}>{active ? stepLabel : slide.metric}</span>
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
  return (
    <div className="mx-auto w-full overflow-hidden rounded-[1.35rem] border border-slate-300/70 bg-white/72 p-2 shadow-2xl shadow-slate-950/16 backdrop-blur-xl dark:border-white/12 dark:bg-white/[0.065] dark:shadow-black/45 sm:rounded-[1.75rem] sm:p-3">
      <div className="mb-2 flex items-center justify-between rounded-2xl bg-white px-3 py-2 dark:bg-black/35 sm:mb-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-rose-400" />
          <span className="h-3 w-3 rounded-full bg-amber-300" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
        </div>
        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white dark:bg-white dark:text-black">{slide.route}</span>
      </div>
      <div className="relative overflow-hidden rounded-2xl bg-slate-950">
        <img
          src={slide.image}
          alt={slide.imageAlt}
          className="block aspect-[4/3] max-h-[43svh] w-full object-cover object-top sm:aspect-auto sm:h-auto sm:max-h-[55svh] sm:object-contain lg:max-h-[70svh] xl:max-h-[76svh]"
          loading="eager"
          decoding="async"
          draggable={false}
        />
      </div>
    </div>
  )
}

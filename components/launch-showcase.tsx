"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Layers3,
  MessageSquare,
  Sparkles,
} from "lucide-react"

const showcaseSlides = [
  {
    key: "dashboard",
    label: "Dashboard",
    title: "Know the next move",
    body: "A command center for today route, recent Studio work, weak topics, calendar blocks, and quick actions.",
    accent: "from-emerald-300 to-sky-300",
    icon: BarChart3,
    bullets: ["Today route", "Weak topics", "Studio recents"],
  },
  {
    key: "studio",
    label: "Studio",
    title: "Create like a suite",
    body: "Notes, docs, sheets, and slides live together with panes, saved drafts, formatting, exports, and AI actions.",
    accent: "from-sky-300 to-indigo-300",
    icon: Layers3,
    bullets: ["Rich docs", "Sheets", "Slide decks"],
  },
  {
    key: "ai",
    label: "AI tutor",
    title: "Prompt with context",
    body: "Task, filters, gateway, result, and insert-back actions are grouped so AI becomes a workflow, not a blank box.",
    accent: "from-violet-300 to-emerald-300",
    icon: Bot,
    bullets: ["Task modes", "Provider gateway", "Insert back"],
  },
  {
    key: "practice",
    label: "Practice",
    title: "Turn notes into reps",
    body: "Quizzes, timed practice, flashcards, mistake retry, and explanations close the learning loop.",
    accent: "from-amber-200 to-emerald-300",
    icon: GraduationCap,
    bullets: ["Timed quiz", "Mistake retry", "Review cards"],
  },
  {
    key: "calendar",
    label: "Calendar",
    title: "Protect the study block",
    body: "Month, agenda, focus blocks, due reviews, and planning cues keep learning visible in time.",
    accent: "from-cyan-200 to-blue-300",
    icon: CalendarDays,
    bullets: ["Month view", "Agenda", "Focus blocks"],
  },
  {
    key: "social",
    label: "Social",
    title: "Learn with others",
    body: "Spaces, rooms, chat, battles, invites, and shared progress are available without crowding the personal vault.",
    accent: "from-rose-200 to-orange-300",
    icon: MessageSquare,
    bullets: ["Spaces", "Chat", "Study battles"],
  },
] as const

type ShowcaseSlide = (typeof showcaseSlides)[number]

export function LaunchShowcase({ signedIn }: { signedIn: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const wheelLocked = useRef(false)
  const activeSlide = showcaseSlides[activeIndex]
  const ActiveIcon = activeSlide.icon
  const progress = useMemo(() => `${activeIndex + 1}`.padStart(2, "0"), [activeIndex])

  function showSlide(index: number) {
    const total = showcaseSlides.length
    setActiveIndex((index + total) % total)
  }

  function handleWheel(event: React.WheelEvent<HTMLElement>) {
    if (Math.abs(event.deltaY) < 24 || wheelLocked.current) return
    wheelLocked.current = true
    showSlide(activeIndex + (event.deltaY > 0 ? 1 : -1))
    window.setTimeout(() => {
      wheelLocked.current = false
    }, 650)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") showSlide(activeIndex + 1)
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") showSlide(activeIndex - 1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [activeIndex])

  return (
    <main onWheel={handleWheel} className="relative h-[100svh] overflow-hidden bg-[#040506] text-white">
      <div className={`absolute inset-0 bg-gradient-to-br ${activeSlide.accent} opacity-20 transition-all duration-700`} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.12),transparent_24%),linear-gradient(135deg,rgba(4,5,6,0.82),rgba(4,5,6,0.96))]" />

      <section className="relative z-10 grid h-full grid-rows-[auto_1fr_auto] px-5 py-4 sm:px-8">
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-md border border-white/12 bg-white/8 px-3 text-sm font-semibold text-white/82 transition hover:bg-white/14">
            <ArrowLeft className="h-4 w-4" />
            Intro
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-black/28 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/54 sm:flex">
            <Sparkles className="h-3.5 w-3.5 text-emerald-200" />
            Workflow gallery
          </div>
          <Link href={signedIn ? "/dashboard" : "/login"} className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-black transition hover:bg-emerald-100">
            {signedIn ? "Open app" : "Start"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>

        <div className="mx-auto grid w-full max-w-7xl min-h-0 items-center gap-3 py-3 sm:gap-5 sm:py-4 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/24 px-3 py-1 text-sm font-semibold text-white/65">
              <ActiveIcon className="h-4 w-4 text-emerald-200" />
              {progress} / {showcaseSlides.length.toString().padStart(2, "0")}
            </div>
            <h1 className="mt-4 max-w-2xl text-balance text-4xl font-semibold leading-[0.98] tracking-tight sm:mt-5 sm:text-6xl">
              {activeSlide.title}
            </h1>
            <p className="mt-4 hidden max-w-xl text-lg leading-8 text-white/62 sm:block">{activeSlide.body}</p>
            <div className="mt-5 hidden flex-wrap gap-2 sm:flex">
              {activeSlide.bullets.map((bullet) => (
                <span key={bullet} className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-sm font-semibold text-white/70">
                  {bullet}
                </span>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 sm:mt-7">
              <button onClick={() => showSlide(activeIndex - 1)} className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/12 bg-white/8 transition hover:bg-white/14" aria-label="Previous slide">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button onClick={() => showSlide(activeIndex + 1)} className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-black transition hover:bg-emerald-100">
                Next slide
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="relative min-h-0 max-h-[44svh] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] p-2 shadow-2xl shadow-black/50 backdrop-blur sm:max-h-none sm:p-3">
            <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
              {showcaseSlides.map((slide) => (
                <div key={slide.key} className="min-w-full">
                  <ShowcaseScreen slide={slide} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-7xl gap-3">
          <div className="flex justify-center gap-2">
            {showcaseSlides.map((slide, index) => (
              <button
                key={slide.key}
                onClick={() => showSlide(index)}
                className={`h-2.5 rounded-full transition-all ${index === activeIndex ? "w-9 bg-white" : "w-2.5 bg-white/25 hover:bg-white/50"}`}
                aria-label={`Show ${slide.label}`}
              />
            ))}
          </div>
          <div className="hidden grid-cols-3 gap-2 sm:grid lg:grid-cols-6">
            {showcaseSlides.map((slide, index) => {
              const Icon = slide.icon
              return (
                <button
                  key={slide.key}
                  onClick={() => showSlide(index)}
                  className={`flex items-center gap-2 rounded-xl border p-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200 ${
                    index === activeIndex ? "border-white bg-white text-black" : "border-white/10 bg-black/24 text-white hover:bg-white/8"
                  }`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${index === activeIndex ? "bg-black text-white" : "bg-white text-black"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{slide.label}</span>
                    <span className={`block truncate text-[11px] ${index === activeIndex ? "text-black/55" : "text-white/45"}`}>{slide.bullets[0]}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}

function ShowcaseScreen({ slide }: { slide: ShowcaseSlide }) {
  if (slide.key === "dashboard") return <DashboardPreview />
  if (slide.key === "studio") return <StudioPreview />
  if (slide.key === "ai") return <AiPreview />
  if (slide.key === "practice") return <PracticePreview />
  if (slide.key === "calendar") return <CalendarPreview />
  return <SocialPreview />
}

function PreviewFrame({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="min-h-[300px] overflow-hidden rounded-2xl border border-white/10 bg-[#eef5ff] p-3 text-slate-950 shadow-2xl sm:min-h-[430px] sm:p-4">
      <div className="mb-4 flex items-center justify-between">
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

function DashboardPreview() {
  return (
    <PreviewFrame title="Dashboard">
      <div className="grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Today route</p>
          <h2 className="mt-3 text-3xl font-semibold">Schedule the next block</h2>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {["Goal 33%", "Studio 5", "Review 1"].map((item) => <span key={item} className="rounded-lg bg-white/10 p-3 text-sm">{item}</span>)}
          </div>
        </section>
        <section className="grid gap-3">
          {["Weak topics", "Studio recents", "Calendar agenda"].map((item) => (
            <div key={item} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold">{item}</p>
              <div className="mt-3 h-2 rounded bg-emerald-300" />
              <div className="mt-2 h-2 w-2/3 rounded bg-sky-200" />
            </div>
          ))}
        </section>
      </div>
    </PreviewFrame>
  )
}

function StudioPreview() {
  return (
    <PreviewFrame title="Studio">
      <div className="grid gap-3 md:grid-cols-[190px_1fr]">
        <aside className="rounded-2xl bg-slate-950 p-3 text-white">
          {["Notes", "Docs", "Sheets", "Slides"].map((item, index) => (
            <div key={item} className={`mb-2 rounded-lg px-3 py-2 text-sm ${index === 0 ? "bg-white text-slate-950" : "bg-white/8"}`}>{item}</div>
          ))}
        </aside>
        <section className="rounded-2xl bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {["Style", "Text", "Paragraph", "Insert", "Find"].map((item) => <span key={item} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold">{item}</span>)}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Notes studio</p>
          <h2 className="mt-2 text-3xl font-semibold">Database Indexing</h2>
          <p className="mt-4 text-slate-600">B-tree indexes reduce scan cost. Hash indexes are fast for exact matches.</p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {["Save", "Export", "Ask AI"].map((item) => <span key={item} className="rounded-lg bg-slate-100 p-3 text-sm font-semibold">{item}</span>)}
          </div>
        </section>
      </div>
    </PreviewFrame>
  )
}

function AiPreview() {
  return (
    <PreviewFrame title="AI Tutor">
      <div className="grid gap-3 md:grid-cols-[1fr_250px]">
        <section className="rounded-2xl bg-white p-4">
          <div className="flex justify-end gap-2">
            {["Task: Quiz", "Filters", "Gateway"].map((item) => <span key={item} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold">{item}</span>)}
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {["Task", "Context", "Output", "Gateway"].map((item) => <span key={item} className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{item}</span>)}
          </div>
          <div className="mt-4 rounded-xl bg-slate-100 p-4 text-slate-700">Generate a quiz from uploaded notes with explanations and retry prompts.</div>
        </section>
        <aside className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-sm font-semibold text-emerald-200">Gateway</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {["12 ready", "7 families", "8 presets", "masked"].map((item) => <span key={item} className="rounded-lg bg-white/10 p-3 text-sm">{item}</span>)}
          </div>
        </aside>
      </div>
    </PreviewFrame>
  )
}

function PracticePreview() {
  return (
    <PreviewFrame title="Practice">
      <div className="grid gap-3 md:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-sm font-semibold text-emerald-200">Timed sprint</p>
          <h2 className="mt-3 text-3xl font-semibold">Question 3 of 8</h2>
          <div className="mt-5 grid gap-2">
            {["True / false", "Fill blank", "Matching"].map((item) => <span key={item} className="rounded-lg bg-white/10 p-3 text-sm">{item}</span>)}
          </div>
        </section>
        <section className="grid gap-3">
          {["Explanation", "Retry missed", "Save mistakes to reviews"].map((item) => <div key={item} className="rounded-xl bg-white p-4 text-sm font-semibold">{item}</div>)}
        </section>
      </div>
    </PreviewFrame>
  )
}

function CalendarPreview() {
  return (
    <PreviewFrame title="Calendar">
      <div className="grid gap-3 md:grid-cols-[1fr_260px]">
        <section className="grid grid-cols-7 gap-2 rounded-2xl bg-white p-4">
          {Array.from({ length: 28 }, (_, index) => (
            <span key={index} className={`grid aspect-square place-items-center rounded-lg text-sm font-semibold ${[5, 12, 18].includes(index) ? "bg-emerald-200" : "bg-slate-100"}`}>{index + 1}</span>
          ))}
        </section>
        <aside className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-sm font-semibold text-emerald-200">Today</p>
          {["Review queue", "Focus block", "AI route"].map((item) => <div key={item} className="mt-3 rounded-lg bg-white/10 p-3 text-sm">{item}</div>)}
        </aside>
      </div>
    </PreviewFrame>
  )
}

function SocialPreview() {
  return (
    <PreviewFrame title="Social">
      <div className="grid gap-3 md:grid-cols-[230px_1fr]">
        <aside className="rounded-2xl bg-slate-950 p-4 text-white">
          {["Learning spaces", "Study rooms", "Battles"].map((item) => <div key={item} className="mb-2 rounded-lg bg-white/10 p-3 text-sm">{item}</div>)}
        </aside>
        <section className="rounded-2xl bg-white p-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="font-semibold">Operating Systems Circle</p>
              <p className="text-sm text-slate-500">Pomodoro room, quiz battle, shared notes</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2">
            {["Sarah protected your streak", "Group quiz starts in 4 minutes", "New note shared"].map((item) => <span key={item} className="rounded-lg bg-slate-100 p-3 text-sm">{item}</span>)}
          </div>
        </section>
      </div>
    </PreviewFrame>
  )
}

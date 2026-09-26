"use client"

import { useEffect, useId, useState, type KeyboardEvent } from "react"
import { ArrowRight, CalendarDays, Check, CheckCheck, FileText, Layers3, MessageCircle, MousePointer2, Plus, Sparkles, Star, Timer, Type } from "lucide-react"
import styles from "./public-experience.module.css"

export const previewSections = [
  { id: "studio", label: "Create", icon: Layers3, title: "A blank page. Endless possibilities.", description: "Notes, canvases, slides and sheets. Together." },
  { id: "ai", label: "Understand", icon: Sparkles, title: "Find your next aha moment.", description: "Bring a source. Ask a question. Connect the dots." },
  { id: "practice", label: "Practice", icon: Star, title: "Make what you learn stick.", description: "Quick quizzes, review cards and a little friendly competition." },
  { id: "calendar", label: "Plan", icon: CalendarDays, title: "A little time. A little progress.", description: "Give your learning a place in your day." },
  { id: "social", label: "Connect", icon: MessageCircle, title: "Good ideas love company.", description: "Share a thought. Start a conversation. Learn together." },
] as const

export type PreviewSection = (typeof previewSections)[number]["id"]
type ProductPreviewProps = {
  section?: PreviewSection
  onSectionChange?: (section: PreviewSection) => void
  sections?: readonly PreviewSection[]
}
const homeSections: readonly PreviewSection[] = ["studio", "practice", "calendar"]

export function ProductPreview({ section, onSectionChange, sections = homeSections }: ProductPreviewProps) {
  const [localSection, setLocalSection] = useState<PreviewSection>("studio")
  const activeSection = section ?? localSection
  const tabs = previewSections.filter(item => sections.includes(item.id))
  const id = useId()
  function select(next: PreviewSection) {
    setLocalSection(next)
    onSectionChange?.(next)
  }
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }
    if (!(event.key in moves)) return
    event.preventDefault()
    const target = tabs[moves[event.key]]
    select(target.id)
    document.getElementById(`${id}-${target.id}`)?.focus()
  }
  return <div className={styles.preview}>
    <div className={styles.previewTabs} role="tablist" aria-label="Explore the workspace">
      {tabs.map(({ id: tab, label, icon: Icon }, index) => <button key={tab} id={`${id}-${tab}`} type="button" role="tab" aria-selected={activeSection === tab} aria-controls={`${id}-panel`} tabIndex={activeSection === tab ? 0 : -1} onClick={() => select(tab)} onKeyDown={event => navigateTabs(event, index)}><Icon size={15} /><span>{label}</span></button>)}
    </div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${activeSection}`} tabIndex={0} className={styles.previewPanel}>
      <div className={styles.windowBar}><div className={styles.windowBrand}><img src="/icon.svg" alt="" width={20} height={20} loading="eager" />{activeSection === "studio" ? "Studio" : activeSection === "ai" ? "AI tutor" : previewSections.find(item => item.id === activeSection)?.label}</div><span className={styles.sampleLabel}>EXAMPLE WORKSPACE</span><span className={styles.windowDots} aria-hidden="true">•••</span></div>
      <div className={styles.scene} key={activeSection}>
        {activeSection === "studio" ? <StudioScene /> : activeSection === "practice" ? <PracticeScene /> : activeSection === "calendar" ? <CalendarScene /> : activeSection === "ai" ? <TutorScene /> : <SocialScene />}
      </div>
    </div>
  </div>
}

function StudioScene() {
  const [palette, setPalette] = useState(0)
  const palettes = ["Periwinkle", "Apricot", "Mint"]
  return <div className={styles.studioScene}>
    <div className={styles.canvasToolbar} aria-hidden="true"><MousePointer2 size={15} /><span /><Type size={16} /><Layers3 size={15} /><Plus size={16} /></div>
    <div className={styles.artBoard} data-palette={palette}>
      <span className={styles.boardEyebrow}>COLLECTING GOOD IDEAS / 001</span>
      <strong>Stay<br />curious<span>.</span></strong>
      <span className={styles.boardFlower} aria-hidden="true">✳</span>
      <span className={styles.boardStamp}>THINK IT.<br />MAKE IT.</span>
      <span className={styles.boardFooter}>A little wonder goes a long way.</span>
    </div>
    <div className={styles.palette} role="group" aria-label="Try a canvas color">{palettes.map((name, index) => <button key={name} type="button" aria-label={name} aria-pressed={palette === index} onClick={() => setPalette(index)} data-palette={index}>{palette === index ? <Check size={13} /> : null}</button>)}</div>
    <div className={styles.floatingNote}><span><FileText size={14} /> A thought worth keeping</span><strong>What if I tried<br />something new?</strong><span className={styles.noteLine} /><span className={styles.noteLine} /></div>
    <span className={styles.demoHint}>Try a color<ArrowRight size={13} /></span>
  </div>
}

function PracticeScene() {
  const [answer, setAnswer] = useState<number | null>(null)
  const options = ["Read it once", "Recall it from memory", "Keep highlighting"]
  return <div className={styles.practiceScene}>
    <div className={styles.practiceMeta}><span><Star size={14} /> QUICK PRACTICE</span><span>01 / 03</span></div>
    <div className={styles.practiceQuestion}><span className={styles.quizSpark} aria-hidden="true">✦</span><h3>What helps an<br />idea stick?</h3></div>
    <div className={styles.answerOptions}>{options.map((option, index) => <button key={option} type="button" onClick={() => setAnswer(index)} aria-pressed={answer === index} data-correct={answer === index && index === 1} data-selected={answer === index}><span>{String.fromCharCode(65 + index)}</span>{option}{answer === index && index === 1 ? <Check size={17} /> : null}</button>)}</div>
    <p className={styles.quizFeedback} role="status">{answer === null ? "Give it a try." : answer === 1 ? "That’s it! Retrieving an idea strengthens the memory." : "Try recalling it. Active practice helps ideas stay with you."}</p>
  </div>
}

function CalendarScene() {
  const [day, setDay] = useState(2)
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"]
  return <div className={styles.calendarScene}>
    <div className={styles.calendarHeading}><div><span>MAKE A LITTLE SPACE</span><h3>Your kind of week.</h3></div><CalendarDays size={25} /></div>
    <div className={styles.weekDays} role="group" aria-label="Preview a day">{days.map((label, index) => <button type="button" key={label} aria-label={`${label} ${12 + index}`} aria-pressed={day === index} onClick={() => setDay(index)}><span>{label}</span><strong>{12 + index}</strong><i /></button>)}</div>
    <div className={styles.dayEvents} aria-live="polite"><div><span>10:00</span><div className={styles.eventCreate}><Layers3 size={17} /><div><strong>{["A fresh idea", "Sketch it out", "Creative hour", "Make a moodboard", "Finish that project"][day]}</strong><span>Make something yours</span></div></div></div><div><span>14:30</span><div className={styles.eventPractice}><Timer size={17} /><div><strong>A moment to practise</strong><span>15 min · Just for you</span></div></div></div></div>
  </div>
}

function TutorScene() {
  const [expanded, setExpanded] = useState(false)
  return <div className={styles.tutorScene}>
    <div className={styles.sourceChip}><FileText size={17} /><span>My learning notes</span><Check size={14} /></div>
    <div className={styles.questionBubble}>Why does teaching help me learn?</div>
    <div className={styles.tutorAnswer}><span className={styles.tutorMark}><Sparkles size={18} /></span><div><h3>Explain it. Understand it.</h3><p>Putting an idea into your own words helps you spot what’s clear — and what isn’t.</p><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Hide example" : "Show me an example"}<ArrowRight size={14} /></button>{expanded ? <p className={styles.exampleAnswer}>Try explaining gravity to a friend without using the word “force.” Notice where you pause.</p> : null}</div></div>
    <span className={styles.tutorFootnote}>Sample response · No AI request is sent</span>
  </div>
}

function SocialScene() {
  return <div className={styles.socialScene}>
    <div className={styles.socialHeading}><div className={styles.avatarGroup}><span>J</span><span>A</span><span>M</span></div><div><h3>The curious corner</h3><span>A place to think together</span></div></div>
    <div className={styles.message}><span className={styles.avatar}>J</span><div><span>Jamie</span><p>Made a little something from today’s notes ✨</p></div></div>
    <div className={styles.sharedIdea}><span>IDEA NO. 12</span><strong>Better<br />together.</strong><span className={styles.sharedFlower} aria-hidden="true">✳</span></div>
    <div className={styles.reply}><span>Love where this is going.</span><CheckCheck size={15} /></div>
  </div>
}

export function usePreviewQuery() {
  const [section, setSection] = useState<PreviewSection>("studio")
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view")
    const valid = previewSections.find(item => item.id === requested)
    if (valid) setSection(valid.id)
  }, [])
  return { section, setSection }
}

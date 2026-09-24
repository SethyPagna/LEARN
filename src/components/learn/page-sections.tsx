"use client"

import { CalendarDays, FolderHeart, TrendingUp, Network, Compass, BookOpen, Radio, Gamepad2, Repeat2 } from "lucide-react"
import type { View } from "./types"

const learningSections = [
  { view: "calendar", label: "Calendar", icon: CalendarDays },
  { view: "vault", label: "Vault", icon: FolderHeart },
  { view: "progress", label: "Progress", icon: TrendingUp },
  { view: "graph", label: "Graph", icon: Network },
  { view: "feed", label: "Discover", icon: Compass },
] as const
const practiceSections = [
  { view: "quizzes", label: "Quizzes", icon: BookOpen },
  { view: "live", label: "Live", icon: Radio },
  { view: "games", label: "Games", icon: Gamepad2 },
  { view: "reviews", label: "Reviews", icon: Repeat2 },
] as const

export function PageSections({ view, setView }: { view: View; setView: (view: View) => void }) {
  const activeView = view === "discover" ? "feed" : view === "practice" ? "quizzes" : view
  const sections = learningSections.some(section => section.view === activeView) ? learningSections : practiceSections.some(section => section.view === activeView) ? practiceSections : null
  if (!sections) return null
  return <nav aria-label={sections === learningSections ? "Learning sections" : "Practice sections"} className="page-sections">
    {sections.map(({ view: destination, label, icon: Icon }) => <button key={destination} type="button" aria-current={activeView === destination ? "page" : undefined} onClick={() => setView(destination)}><Icon aria-hidden="true" className="h-4 w-4" /><span>{label}</span></button>)}
  </nav>
}

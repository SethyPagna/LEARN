"use client"

import { useEffect, useMemo, useState } from "react"
import { BookOpen, Gamepad2, MessageSquare, Radio, Sparkles, Swords, Users, UserRound, Trash2 } from "lucide-react"
import type { Quiz, User, View } from "../../types"
import type { WorkspaceOptions } from "../../preferences"
import { PracticeDesign } from "../../practice-design"
import { SocialLearningView } from "../ecosystem-views"
import { ChatView, GamesView } from "../productivity-views"
import { QuizView } from "../quiz-view"
import { AI_TUTOR_LAUNCH_KEY, buildPracticeAiTutorLaunch } from "@/lib/ai/tutor-workflow"
import { socialWorkspaceTabFromView, socialWorkspaceTabs, viewFromSocialWorkspaceTab } from "@/lib/learn-workspace-navigation"
import { clearPracticeDraft, listPracticeDraftCards, PRACTICE_DRAFT_EVENT, readPracticeDrafts, type PracticeDraftCard } from "@/lib/practice-drafts"

export function PracticeWorkspaceView({ initialView, options, quizzes, selectedQuizId, setSelectedQuizId, setView }: { initialView: View; options: WorkspaceOptions; quizzes: Quiz[]; selectedQuizId: string; setSelectedQuizId: (id: string) => void; setView: (view: View) => void }) {
  const [drafts, setDrafts] = useState<PracticeDraftCard[]>([])
  const titles = useMemo(() => Object.fromEntries(quizzes.map(quiz => [quiz.id, quiz.title])), [quizzes])
  useEffect(() => { const update = () => setDrafts(listPracticeDraftCards(readPracticeDrafts(), titles)); update(); window.addEventListener(PRACTICE_DRAFT_EVENT, update); return () => window.removeEventListener(PRACTICE_DRAFT_EVENT, update) }, [titles])
  function createPractice() {
    localStorage.setItem(AI_TUTOR_LAUNCH_KEY, JSON.stringify(buildPracticeAiTutorLaunch({ draftCount: drafts.length, quizCount: quizzes.length, selectedQuizTitle: titles[selectedQuizId] })))
    setView("ai")
  }
  return <PracticeDesign><div className="practice-launches practice-extra">
    <button onClick={() => setView("quizzes")}><BookOpen /><span>Quiz</span><small>At your pace</small></button>
    <button onClick={() => setView("games")}><Gamepad2 /><span>Sprint</span><small>Beat the clock</small></button>
    <button onClick={() => setView("live")}><Radio /><span>Live</span><small>Play together</small></button>
    <button onClick={createPractice}><Sparkles /><span>Create</span><small>With AI</small></button>
  </div>
    {initialView === "games" ? <GamesView quizzes={quizzes} options={options} /> : <QuizView quizzes={quizzes} selectedQuizId={selectedQuizId} setSelectedQuizId={setSelectedQuizId} options={options} />}
    {drafts.length ? <details className="workspace-disclosure practice-extra mt-3"><summary>Saved attempts <span className="text-muted-foreground">{drafts.length}</span></summary><div className="pt-2">{drafts.map(draft => <div key={draft.quizId} className="flex gap-2"><button className="compact-row flex-1" onClick={() => { setSelectedQuizId(draft.quizId); setView("quizzes") }}><BookOpen className="h-4 w-4" /><span className="truncate">{titles[draft.quizId] || "Practice set"}</span><span className="ml-auto text-xs">{draft.answeredCount} answered</span></button><button className="editor-command" aria-label={`Clear attempt for ${titles[draft.quizId] || "practice set"}`} onClick={() => { clearPracticeDraft(draft.quizId); setDrafts(listPracticeDraftCards(readPracticeDrafts(), titles)) }}><Trash2 className="h-4 w-4" /></button></div>)}</div></details> : null}
  </PracticeDesign>
}

const socialIcons = { chat: MessageSquare, spaces: Users, rooms: Radio, battles: Swords }
export function SocialWorkspaceView({ initialView, options, setView, user }: { initialView: View; options: WorkspaceOptions; setView: (view: View) => void; user: User | null }) {
  const tab = socialWorkspaceTabFromView(initialView)
  return <section className="social-workspace grid min-w-0 gap-3">
    <header className="social-heading"><span className="font-semibold">Social</span><nav aria-label="Social sections" className="page-sections">{socialWorkspaceTabs.map(item => { const Icon = socialIcons[item.id]; return <button key={item.id} aria-current={tab === item.id ? "page" : undefined} onClick={() => setView(viewFromSocialWorkspaceTab(item.id))}><Icon className="h-4 w-4" />{item.id === "rooms" ? "Rooms" : item.id === "battles" ? "Battles" : item.label}</button> })}</nav><button className="editor-command" title={user?.name || "Your profile"} aria-label="Your profile" onClick={() => setView("profile")}><UserRound className="h-4 w-4" /></button></header>
    {tab === "chat" ? <ChatView options={options} /> : <SocialLearningView key={tab} kind={tab} setView={setView} />}
  </section>
}

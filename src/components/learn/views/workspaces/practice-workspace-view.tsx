"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowRight, BookOpen, Layers3, Play, Radio, Repeat2, Search, Sparkles, Zap } from "lucide-react"
import type { Quiz, View } from "../../types"
import type { WorkspaceOptions } from "../../preferences"
import { PracticeDesign } from "../../practice-design"
import { GamesView } from "../productivity-views"
import { QuizView } from "../quiz-view"
import { AI_TUTOR_LAUNCH_KEY, buildPracticeAiTutorLaunch } from "@/lib/ai/tutor-workflow"
import { listPracticeDraftCards, PRACTICE_DRAFT_EVENT, readPracticeDrafts, type PracticeDraftCard } from "@/lib/practice-drafts"
import styles from "../practice-workspace.module.css"

interface PracticeWorkspaceProps {
  initialView: View
  options: WorkspaceOptions
  quizzes: Quiz[]
  selectedQuizId: string
  setSelectedQuizId: (id: string) => void
  setView: (view: View) => void
  quizLaunch?: { id: string }
  libraryRevision?: number
  onQuizArchived?: (id: string) => void
}

export function PracticeWorkspaceView({ initialView, options, quizzes, selectedQuizId, setSelectedQuizId, setView, quizLaunch, libraryRevision, onQuizArchived }: PracticeWorkspaceProps) {
  const [drafts, setDrafts] = useState<PracticeDraftCard[]>([])
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null)
  const [archivedIds, setArchivedIds] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [savedOnly, setSavedOnly] = useState(false)
  const [status, setStatus] = useState("")
  const titles = useMemo(() => Object.fromEntries(quizzes.map(quiz => [quiz.id, quiz.title])), [quizzes])
  const availableQuizzes = useMemo(() => quizzes.filter(quiz => !archivedIds.includes(quiz.id)), [archivedIds, quizzes])
  const draftsById = useMemo(() => new Map(drafts.map(draft => [draft.quizId, draft])), [drafts])
  const visibleQuizzes = useMemo(() => availableQuizzes.filter(quiz => {
    const matchesQuery = `${quiz.title} ${quiz.topic}`.toLowerCase().includes(query.trim().toLowerCase())
    return matchesQuery && (!savedOnly || draftsById.has(quiz.id))
  }), [availableQuizzes, draftsById, query, savedOnly])
  const savedCount = availableQuizzes.filter(quiz => draftsById.has(quiz.id)).length

  useEffect(() => {
    function updateDrafts() {
      try { setDrafts(listPracticeDraftCards(readPracticeDrafts(), titles)) }
      catch { setStatus("Local saves are unavailable in this browser.") }
    }
    updateDrafts()
    window.addEventListener(PRACTICE_DRAFT_EVENT, updateDrafts)
    window.addEventListener("storage", updateDrafts)
    return () => {
      window.removeEventListener(PRACTICE_DRAFT_EVENT, updateDrafts)
      window.removeEventListener("storage", updateDrafts)
    }
  }, [titles])

  useEffect(() => { setActiveQuizId(null) }, [libraryRevision])

  useEffect(() => {
    if (quizLaunch) setActiveQuizId(quizLaunch.id)
  }, [quizLaunch])

  function createPractice() {
    try {
      localStorage.setItem(AI_TUTOR_LAUNCH_KEY, JSON.stringify(buildPracticeAiTutorLaunch({ draftCount: drafts.length, quizCount: availableQuizzes.length, selectedQuizTitle: titles[selectedQuizId] })))
      setView("ai")
    } catch { setStatus("Browser storage is unavailable. Open AI tutor to create a practice set.") }
  }

  function openQuiz(id: string) {
    setSelectedQuizId(id)
    setActiveQuizId(id)
  }

  const library = initialView !== "games" && !activeQuizId
  return <PracticeDesign allowFocus={!library} toolbar={<div className={styles.toolbarContent}>
    <span className={styles.toolbarTitle}>{initialView === "games" ? "Sprint" : library ? "Your sets" : "Practice"}</span>
    <button type="button" className={`practice-extra ${styles.createButton}`} onClick={createPractice} aria-label="Create practice with AI"><Sparkles aria-hidden="true" size={15} />Create</button>
  </div>}>
    <div className={styles.workspace}>
      {status ? <p className={styles.notice} role="status">{status}</p> : null}
      {initialView === "games" ? <GamesView quizzes={quizzes} options={options} /> : activeQuizId ? <QuizView key={activeQuizId} quizzes={availableQuizzes} selectedQuizId={activeQuizId} setSelectedQuizId={setSelectedQuizId} options={options} onArchived={onQuizArchived} onBack={() => { setActiveQuizId(null); setView("quizzes") }} onArchive={id => { setArchivedIds(ids => [...ids, id]); setActiveQuizId(null); setView("quizzes") }} /> : <>
        <div className={styles.shortcuts} aria-label="Practice activities">
          <button type="button" data-tone="violet" onClick={() => setView("games")}><span><Zap aria-hidden="true" /></span><strong>Sprint</strong><ArrowRight aria-hidden="true" size={17} /></button>
          <button type="button" data-tone="coral" onClick={() => setView("live")}><span><Radio aria-hidden="true" /></span><strong>Live</strong><ArrowRight aria-hidden="true" size={17} /></button>
          <button type="button" data-tone="mint" onClick={() => setView("reviews")}><span><Repeat2 aria-hidden="true" /></span><strong>Review</strong><ArrowRight aria-hidden="true" size={17} /></button>
        </div>
        <div className={styles.libraryTools}>
          <div className={styles.segmented} role="group" aria-label="Practice library filter">
            <button type="button" aria-pressed={!savedOnly} onClick={() => setSavedOnly(false)}>All <span>{availableQuizzes.length}</span></button>
            <button type="button" aria-pressed={savedOnly} onClick={() => setSavedOnly(true)}>Saved <span>{savedCount}</span></button>
          </div>
          <label className={styles.search}><Search aria-hidden="true" size={16} /><input aria-label="Find a practice set" placeholder="Find a set" value={query} onChange={event => setQuery(event.target.value)} /></label>
        </div>
        <div className={styles.setGrid} aria-label="Practice sets">
          {visibleQuizzes.map((quiz, index) => {
            const draft = draftsById.get(quiz.id)
            const questionCount = quiz.question_count ?? quiz.questions?.length ?? 0
            const progress = questionCount && draft ? Math.min(100, draft.answeredCount / questionCount * 100) : 0
            return <button type="button" key={quiz.id} className={styles.setCard} data-tone={["violet", "mint", "coral", "blue"][index % 4]} onClick={() => openQuiz(quiz.id)} aria-label={`${draft ? "Resume" : "Open"} ${quiz.title}`}>
              <span className={styles.cardArt} aria-hidden="true"><span className={styles.artSheet}><span /><span /><span /></span><span className={styles.artIcon}>{draft ? <Play /> : <Layers3 />}</span></span>
              <span className={styles.cardTopic}>{quiz.topic || "Practice"}</span>
              <strong className={styles.cardTitle}>{quiz.title}</strong>
              <span className={styles.cardMeta}><span>{questionCount} questions</span><span>{draft ? "Resume" : "Start"}<ArrowRight aria-hidden="true" size={14} /></span></span>
              {draft ? <span className={styles.cardProgress} role="progressbar" aria-label={`${quiz.title} answered`} aria-valuenow={draft.answeredCount} aria-valuemin={0} aria-valuemax={Math.max(questionCount, draft.answeredCount)}><span style={{ width: `${progress}%` }} /></span> : null}
            </button>
          })}
        </div>
        {!visibleQuizzes.length ? <div className={styles.empty}><BookOpen aria-hidden="true" size={34} /><h3>{query ? "No matching sets" : savedOnly ? "No saved attempts" : "Make your first set"}</h3>{query || savedOnly ? <button type="button" className={styles.secondaryButton} onClick={() => { setQuery(""); setSavedOnly(false) }}>Show all</button> : <button type="button" className={styles.primaryButton} onClick={createPractice}><Sparkles aria-hidden="true" size={16} />Create</button>}</div> : null}
      </>}
    </div>
  </PracticeDesign>
}

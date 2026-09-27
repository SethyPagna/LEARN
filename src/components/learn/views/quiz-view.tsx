"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Flag, Layers3, Loader2, Pause, Play, RotateCcw, Settings2, Trash2, Trophy, X } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { PracticeAttemptSummary, PracticeMode, Quiz, QuizAttemptResult } from "../types"
import { api } from "../api"
import { SharePanel } from "../share-panel"
import { clearPracticeDraft, clearPracticeDraftIfUnchanged, hasPracticeDraftContent, readPracticeDraft, writePracticeDraft, type PracticeDraftState } from "@/lib/practice-drafts"
import { buildMistakeRetrySet, buildPracticeReviewCards, filterPracticeQuestions, practiceModeGroups, practiceModeLabel, summarizePracticeAttempt, type PracticeQuestionFilter } from "@/lib/practice-features"
import styles from "./practice-workspace.module.css"

type SessionPhase = "setup" | "run" | "result"
type PendingAction = "submit" | "reviews" | "archive" | null

interface QuizViewProps {
  quizzes: Quiz[]
  selectedQuizId: string
  setSelectedQuizId: (id: string) => void
  options: WorkspaceOptions
  onBack?: () => void
  onArchive?: (id: string) => void
  onArchived?: (id: string) => void
}

const questionFilters: Array<{ id: PracticeQuestionFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unanswered", label: "Unanswered" },
  { id: "marked", label: "Marked" },
  { id: "missed", label: "Missed" },
]
const featuredModes = [
  { id: "quiz", label: "Quiz", icon: BookOpen, hint: "At your pace" },
  { id: "exam", label: "Exam", icon: Clock3, hint: "No hints" },
  { id: "flashcards", label: "Cards", icon: Layers3, hint: "Recall, then reveal" },
] as const

export function QuizView({ selectedQuizId, options, onBack, onArchive, onArchived }: QuizViewProps) {
  const defaultMode: PracticeMode = options.quizMode === "exam" ? "exam" : "quiz"
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [loadError, setLoadError] = useState("")
  const [loadRevision, setLoadRevision] = useState(0)
  const [phase, setPhase] = useState<SessionPhase>("setup")
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [markedIds, setMarkedIds] = useState<string[]>([])
  const [retryIds, setRetryIds] = useState<string[]>([])
  const [practiceMode, setPracticeMode] = useState<PracticeMode>(defaultMode)
  const [questionFilter, setQuestionFilter] = useState<PracticeQuestionFilter>("all")
  const [questionIndex, setQuestionIndex] = useState(0)
  const [targetMinutes, setTargetMinutes] = useState(defaultMode === "exam" ? 20 : 10)
  const [startedAt, setStartedAt] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [paused, setPaused] = useState(false)
  const [summary, setSummary] = useState<PracticeAttemptSummary | null>(null)
  const [pending, setPending] = useState<PendingAction>(null)
  const [status, setStatus] = useState("")
  const [savedDraft, setSavedDraft] = useState(false)
  const [draftStatus, setDraftStatus] = useState("")
  const [cardsSaved, setCardsSaved] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [showQuestions, setShowQuestions] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [revealedCards, setRevealedCards] = useState<string[]>([])
  const pendingRef = useRef<PendingAction>(null)
  const latestDraft = useRef<PracticeDraftState | null>(null)
  const persistedDraft = useRef<PracticeDraftState | null>(null)
  const mounted = useRef(true)
  const questionHeading = useRef<HTMLHeadingElement>(null)

  const questions = useMemo(() => retryIds.length ? buildMistakeRetrySet(quiz?.questions || [], retryIds) : quiz?.questions || [], [quiz?.questions, retryIds])
  const answeredIds = useMemo(() => Object.keys(answers).filter(id => questions.some(question => question.id === id)), [answers, questions])
  const filteredQuestions = useMemo(() => filterPracticeQuestions(questions, { filter: questionFilter, answeredQuestionIds: answeredIds, markedQuestionIds: markedIds, missedQuestionIds: summary?.missedQuestionIds || retryIds }), [answeredIds, markedIds, questionFilter, questions, retryIds, summary?.missedQuestionIds])
  const activeIndex = Math.min(questionIndex, Math.max(0, filteredQuestions.length - 1))
  const question = filteredQuestions[activeIndex]
  const answeredCount = answeredIds.length
  const progress = questions.length ? Math.round(answeredCount / questions.length * 100) : 0
  const remainingSeconds = Math.max(0, targetMinutes * 60 - elapsedSeconds)
  const isFlashcard = practiceMode === "flashcards"
  const canRevealFeedback = phase === "result" || (options.revealAnswers && practiceMode !== "exam")

  function persistDraft(draft: PracticeDraftState) {
    writePracticeDraft(draft)
    persistedDraft.current = draft
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (latestDraft.current) {
        try { persistDraft(latestDraft.current) } catch { /* The player reports storage failures while mounted. */ }
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setQuiz(null)
    setLoadError("")
    api<{ item: Quiz }>(`/api/quizzes/${encodeURIComponent(selectedQuizId)}`, { signal: controller.signal }).then(({ item }) => {
      if (controller.signal.aborted) return
      setQuiz(item)
      let draft: PracticeDraftState | null = null
      try { draft = readPracticeDraft(item.id) }
      catch { setDraftStatus("Local saves are unavailable.") }
      persistedDraft.current = draft
      const validQuestions = new Map((item.questions || []).map(question => [question.id, question]))
      const restoredAnswers = Object.fromEntries(Object.entries(draft?.answers || {}).filter(([id, answer]) => validQuestions.get(id)?.choices.some(choice => choice.id === answer)))
      setAnswers(restoredAnswers)
      setMarkedIds((draft?.markedQuestionIds || []).filter(id => validQuestions.has(id)))
      setRetryIds((draft?.retryQuestionIds || []).filter(id => validQuestions.has(id)))
      setQuestionFilter(draft?.questionFilter || "all")
      setPracticeMode(draft?.practiceMode || defaultMode)
      setTargetMinutes(draft?.targetMinutes || (defaultMode === "exam" ? 20 : 10))
      setElapsedSeconds(draft?.elapsedSeconds || 0)
      setSavedDraft(Boolean(draft))
      setPhase("setup")
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Unable to open this set.")
    })
    return () => controller.abort()
  }, [defaultMode, loadRevision, selectedQuizId])

  useEffect(() => {
    if (phase !== "run" || paused) return
    const timer = window.setInterval(() => setElapsedSeconds(elapsedSince(startedAt)), 1000)
    return () => window.clearInterval(timer)
  }, [paused, phase, startedAt])

  const draftElapsedBucket = Math.floor(elapsedSeconds / 10)
  latestDraft.current = quiz && phase === "run" ? {
    quizId: quiz.id, answers, markedQuestionIds: markedIds, retryQuestionIds: retryIds, questionFilter,
    practiceMode, targetMinutes, elapsedSeconds: paused ? elapsedSeconds : elapsedSince(startedAt), updatedAt: new Date().toISOString(),
  } : null

  useEffect(() => {
    const draft = latestDraft.current
    if (!draft || !hasPracticeDraftContent(draft, defaultMode)) return
    const timeout = window.setTimeout(() => {
      try { persistDraft(draft); setDraftStatus("Saved on this device") }
      catch { setDraftStatus("Could not save on this device. Keep this tab open.") }
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [answers, defaultMode, draftElapsedBucket, markedIds, paused, phase, practiceMode, questionFilter, retryIds, targetMinutes])

  function beginSession() {
    setStartedAt(Date.now() - elapsedSeconds * 1000)
    setPaused(false)
    setPhase("run")
    setStatus("")
    setQuestionIndex(0)
    setShowReview(false)
  }

  function togglePause() {
    if (pendingRef.current) return
    if (paused) setStartedAt(Date.now() - elapsedSeconds * 1000)
    else setElapsedSeconds(elapsedSince(startedAt))
    setPaused(value => !value)
  }

  function resetSession() {
    if (!quiz || pendingRef.current) return
    try { clearPracticeDraft(quiz.id) } catch { setDraftStatus("Could not clear the local save.") }
    latestDraft.current = null
    setAnswers({})
    setMarkedIds([])
    setRetryIds([])
    setSummary(null)
    setQuestionIndex(0)
    setQuestionFilter("all")
    setElapsedSeconds(0)
    setSavedDraft(false)
    setPhase("setup")
    setShowReview(false)
    setRevealedCards([])
    setCardsSaved(false)
    setStatus("")
  }

  function chooseAnswer(choiceId: string) {
    if (!question || phase !== "run" || paused || pendingRef.current) return
    setAnswers(current => ({ ...current, [question.id]: choiceId }))
    setConfirmFinish(false)
  }

  function changeQuestion(index: number) {
    setQuestionIndex(index)
    setConfirmFinish(false)
    window.requestAnimationFrame(() => questionHeading.current?.focus({ preventScroll: true }))
  }

  async function submitAttempt() {
    if (!quiz || pendingRef.current || !answeredCount || phase !== "run") return
    pendingRef.current = "submit"
    setPending("submit")
    setStatus("")
    const durationSeconds = paused ? elapsedSeconds : elapsedSince(startedAt)
    const submittedAnswers = answeredIds.map(questionId => ({ questionId, selectedAnswerId: answers[questionId] }))
    try {
      await api<QuizAttemptResult>("/api/quizzes/attempts", { method: "POST", body: JSON.stringify({ quizId: quiz.id, answers: submittedAnswers, durationSeconds }) })
      latestDraft.current = null
      try {
        if (persistedDraft.current) clearPracticeDraftIfUnchanged(persistedDraft.current)
        if (mounted.current) setDraftStatus("")
      } catch { if (mounted.current) setDraftStatus("Attempt saved. The old local draft could not be cleared.") }
      if (!mounted.current) return
      setSummary(summarizePracticeAttempt({ mode: practiceMode, questions, answers: submittedAnswers, durationSeconds }))
      setElapsedSeconds(durationSeconds)
      setPhase("result")
      setShowReview(false)
      setCardsSaved(false)
      setConfirmFinish(false)
    } catch (error) {
      if (mounted.current) setStatus(error instanceof Error ? error.message : "Could not save this attempt. Your answers are still here.")
    } finally {
      pendingRef.current = null
      if (mounted.current) setPending(null)
    }
  }

  function finishSession() {
    if (answeredCount < questions.length) setConfirmFinish(true)
    else void submitAttempt()
  }

  function retryMissed() {
    if (!summary?.missedQuestionIds.length || pendingRef.current) return
    setRetryIds(summary.missedQuestionIds)
    setMarkedIds([])
    setAnswers({})
    setSummary(null)
    setPracticeMode("mistake-retry")
    setQuestionFilter("all")
    setQuestionIndex(0)
    setElapsedSeconds(0)
    setStartedAt(Date.now())
    setPaused(false)
    setPhase("run")
    setShowReview(false)
    setStatus("")
    setRevealedCards([])
  }

  async function saveReviewCards() {
    if (!quiz || !summary?.missedQuestionIds.length || pendingRef.current || cardsSaved) return
    const items = buildPracticeReviewCards({ quizId: quiz.id, quizTitle: quiz.title, questions, missedQuestionIds: summary.missedQuestionIds })
    if (!items.length) return
    pendingRef.current = "reviews"
    setPending("reviews")
    setStatus("")
    try {
      const response = await api<{ item: { count: number } }>("/api/reviews", { method: "POST", body: JSON.stringify({ items }) })
      if (!mounted.current) return
      setCardsSaved(true)
      setStatus(`Saved ${response.item.count} review cards.`)
    } catch (error) {
      if (mounted.current) setStatus(error instanceof Error ? error.message : "Could not save review cards. Try again.")
    } finally { pendingRef.current = null; if (mounted.current) setPending(null) }
  }

  async function archiveSet() {
    if (!quiz || pendingRef.current) return
    if (!window.confirm(`Archive "${quiz.title}"? Existing attempts stay saved.`)) return
    pendingRef.current = "archive"
    setPending("archive")
    setStatus("")
    try {
      await api(`/api/quizzes/${encodeURIComponent(quiz.id)}`, { method: "DELETE" })
      latestDraft.current = null
      try { clearPracticeDraft(quiz.id) } catch { /* Archived sets no longer appear in the library. */ }
      onArchived?.(quiz.id)
      if (mounted.current) onArchive?.(quiz.id)
    } catch (error) {
      if (mounted.current) setStatus(error instanceof Error ? error.message : "Could not archive this set.")
    } finally { pendingRef.current = null; if (mounted.current) setPending(null) }
  }

  function returnToLibrary() {
    if (pendingRef.current) return
    if (latestDraft.current) {
      try { persistDraft(latestDraft.current) }
      catch { setDraftStatus("Could not save this attempt. Keep this tab open."); return }
    }
    onBack?.()
  }

  if (!quiz) return <div className={styles.empty}>
    {loadError ? <><BookOpen size={30} aria-hidden="true" /><h2>Unable to open this set</h2><p role="alert">{loadError}</p><div className={styles.actionRow}><button className={styles.secondaryButton} onClick={onBack}>Back to sets</button><button className={styles.primaryButton} onClick={() => setLoadRevision(value => value + 1)}>Try again</button></div></> : <><Loader2 className="animate-spin" aria-hidden="true" /><p role="status">Opening set…</p><button type="button" className={styles.secondaryButton} onClick={onBack}>Back to sets</button></>}
  </div>

  return <div className={styles.player} aria-label="Practice session">
    <header className={styles.sessionHeader}>
      <button type="button" className={styles.iconButton} onClick={returnToLibrary} disabled={Boolean(pending)} aria-label="Back to sets" title="Back to sets"><ArrowLeft size={18} /></button>
      <div className={styles.sessionTitle}><span>{quiz.topic || "Practice"}</span><h2>{quiz.title}</h2></div>
      <button type="button" className={styles.iconButton} aria-label="Practice options" title="Practice options" aria-expanded={showOptions} onClick={() => setShowOptions(value => !value)}><Settings2 size={18} /></button>
    </header>
    {showOptions ? <div className={styles.optionsPanel}>
      <label>Mode<select aria-label="Practice mode" value={practiceMode} disabled={Boolean(pending) || phase === "result"} onChange={event => setPracticeMode(event.target.value as PracticeMode)}>{practiceModeGroups.map(group => <optgroup key={group.id} label={group.label}>{group.modes.map(mode => <option value={mode} key={mode}>{practiceModeLabel(mode)}</option>)}</optgroup>)}</select></label>
      <label>Time goal<select aria-label="Time goal" value={targetMinutes} disabled={Boolean(pending)} onChange={event => setTargetMinutes(Number(event.target.value))}>{[5, 10, 20, 45].map(minutes => <option key={minutes} value={minutes}>{minutes} min</option>)}</select></label>
      <div className={styles.optionActions}><SharePanel sourceTable="quizzes" sourceId={quiz.id} /><button type="button" className={styles.iconButton} disabled={Boolean(pending)} onClick={archiveSet} aria-label="Archive set" title="Archive set"><Trash2 size={16} /></button></div>
      {quiz.description ? <p className={styles.setDescription}>{quiz.description}</p> : null}
    </div> : null}
    {status ? <p className={styles.notice} role="status">{status}</p> : null}
    {phase === "setup" ? <div className={styles.setup}>
      <div className={styles.setupMark} aria-hidden="true"><Layers3 size={34} /><span>{questions.length}</span></div>
      <h3>{savedDraft ? "Ready to pick up?" : "Make it your session."}</h3>
      <p>{savedDraft ? `${answeredCount} of ${questions.length} answered · ${formatDuration(elapsedSeconds)}` : `${questions.length} questions`}</p>
      <div className={styles.modeCards} role="group" aria-label="Session style">{featuredModes.map(({ id, label, icon: Icon, hint }) => <button type="button" key={id} aria-pressed={practiceMode === id} onClick={() => setPracticeMode(id)}><Icon aria-hidden="true" size={23} /><strong>{label}</strong><small>{hint}</small></button>)}</div>
      {!featuredModes.some(mode => mode.id === practiceMode) ? <span className={styles.modeLabel}>{practiceModeLabel(practiceMode)}</span> : null}
      <div className={styles.actionRow}><button type="button" className={styles.primaryButton} onClick={beginSession} disabled={!questions.length}><Play aria-hidden="true" size={16} />{savedDraft ? "Resume" : "Start"}</button>{savedDraft ? <button type="button" className={styles.secondaryButton} onClick={() => { if (window.confirm("Start over and clear this saved attempt?")) resetSession() }}>Start over</button> : null}</div>
      {!questions.length ? <p role="status">This set has no questions yet.</p> : null}
    </div> : null}
    {phase === "result" && summary ? <section className={styles.results} aria-label="Practice results">
      <div className={styles.resultRing} style={{ "--score": `${summary.total ? summary.score / summary.total * 100 : 0}%` } as React.CSSProperties}><span><Trophy aria-hidden="true" size={22} /><strong aria-label={`Score ${summary.score} out of ${summary.total}`}>{summary.score}<small> / {summary.total}</small></strong></span></div>
      <h3>{summary.score === summary.total ? "All clear." : "Good work. Keep going."}</h3>
      <p>{summary.missedQuestionIds.length ? `${summary.missedQuestionIds.length} to revisit` : "Every question correct"} <span aria-hidden="true">·</span> {formatDuration(summary.durationSeconds)}</p>
      <div className={styles.actionRow}>{summary.missedQuestionIds.length ? <button type="button" className={styles.primaryButton} onClick={retryMissed} disabled={Boolean(pending)}><RotateCcw aria-hidden="true" size={15} />Retry missed</button> : <button type="button" className={styles.primaryButton} onClick={returnToLibrary}>Back to sets<ArrowRight aria-hidden="true" size={15} /></button>}<button type="button" className={styles.secondaryButton} onClick={() => { setShowReview(value => !value); setQuestionFilter("all"); setQuestionIndex(0) }}>{showReview ? "Hide answers" : "Review answers"}</button></div>
      <div className={styles.resultSecondary}>{summary.missedQuestionIds.length ? <button type="button" disabled={Boolean(pending) || cardsSaved} onClick={saveReviewCards}>{pending === "reviews" ? "Saving…" : cardsSaved ? "Cards saved" : "Save review cards"}</button> : null}<button type="button" disabled={Boolean(pending)} onClick={resetSession}>New attempt</button></div>
    </section> : null}
    {phase === "run" || showReview ? <>
      <div className={styles.progressRow}><span>{answeredCount}/{questions.length}</span><div role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><span className={remainingSeconds === 0 ? styles.timeWarning : ""}><Clock3 aria-hidden="true" size={14} />{formatDuration(practiceMode === "exam" ? remainingSeconds : elapsedSeconds)}</span>{phase === "run" ? <button type="button" className={styles.iconButton} onClick={togglePause} disabled={Boolean(pending)} aria-label={paused ? "Resume timer" : "Pause timer"} title={paused ? "Resume timer" : "Pause timer"}>{paused ? <Play size={15} /> : <Pause size={15} />}</button> : null}</div>
      {phase === "run" && practiceMode === "exam" && remainingSeconds === 0 ? <p className={styles.notice} role="status">Time goal reached. Finish when you’re ready.</p> : null}
      <div className={styles.questionTools}><button type="button" className={styles.secondaryButton} aria-expanded={showQuestions} onClick={() => setShowQuestions(value => !value)}><Layers3 aria-hidden="true" size={15} />Questions</button><label className={styles.filterLabel}><span className="sr-only">Filter questions</span><select aria-label="Filter questions" value={questionFilter} onChange={event => { setQuestionFilter(event.target.value as PracticeQuestionFilter); setQuestionIndex(0) }}>{questionFilters.map(filter => <option key={filter.id} value={filter.id}>{filter.label}</option>)}</select></label></div>
      {showQuestions ? <nav className={styles.questionMap} aria-label="Question navigation">{filteredQuestions.map((item, index) => <button type="button" key={item.id} data-answered={Boolean(answers[item.id])} data-marked={markedIds.includes(item.id)} aria-current={activeIndex === index ? "step" : undefined} aria-label={`Question ${questions.indexOf(item) + 1}${answers[item.id] ? ", answered" : ""}${markedIds.includes(item.id) ? ", marked" : ""}`} onClick={() => changeQuestion(index)}>{questions.indexOf(item) + 1}{markedIds.includes(item.id) ? <Flag aria-hidden="true" size={9} /> : null}</button>)}</nav> : null}
      {paused && phase === "run" ? <div className={styles.paused}><Pause aria-hidden="true" size={28} /><h3>Take a breath.</h3><button type="button" className={styles.primaryButton} onClick={togglePause}>Resume</button></div> : question ? <article className={styles.questionCard}>
        <div className={styles.questionEyebrow}><span>QUESTION {questions.indexOf(question) + 1}<span> / {questions.length}</span></span><button type="button" className={styles.iconButton} disabled={phase === "result" || Boolean(pending)} aria-label={markedIds.includes(question.id) ? "Unmark question" : "Mark for review"} title={markedIds.includes(question.id) ? "Unmark question" : "Mark for review"} aria-pressed={markedIds.includes(question.id)} onClick={() => setMarkedIds(ids => ids.includes(question.id) ? ids.filter(id => id !== question.id) : [...ids, question.id])}><Flag size={17} /></button></div>
        <h3 ref={questionHeading} tabIndex={-1}>{question.question}</h3>
        {isFlashcard && phase === "run" && !revealedCards.includes(question.id) ? <button type="button" className={styles.flashcardReveal} onClick={() => setRevealedCards(ids => [...ids, question.id])}><Layers3 aria-hidden="true" size={22} />Reveal choices<ArrowRight aria-hidden="true" size={16} /></button> : <div className={styles.answerGrid} role="group" aria-label={`Answers for question ${questions.indexOf(question) + 1}`}>
          {question.choices.map((choice, index) => {
            const chosen = answers[question.id] === choice.id
            const correct = choice.id === question.correct_answer_id
            const showCorrect = canRevealFeedback && (phase === "result" || chosen)
            return <button type="button" key={choice.id} className={styles.answer} data-tone={["violet", "blue", "coral", "mint"][index % 4]} data-selected={chosen} data-result={showCorrect ? correct ? "correct" : "wrong" : undefined} aria-pressed={chosen} disabled={phase !== "run" || Boolean(pending)} onClick={() => chooseAnswer(choice.id)}><span className={styles.answerLetter}>{String.fromCharCode(65 + index)}</span><span className={styles.answerText}>{choice.text}</span>{chosen ? showCorrect && !correct ? <X aria-label="Incorrect" size={18} /> : <Check aria-label={showCorrect ? "Correct" : "Selected"} size={18} /> : showCorrect && correct ? <CheckCircle2 aria-label="Correct answer" size={18} /> : null}</button>
          })}
        </div>}
        {canRevealFeedback && answers[question.id] && question.explanation ? <details className={styles.explanation}><summary>Explanation</summary><p>{question.explanation}</p></details> : null}
        {phase === "run" && answers[question.id] ? <button type="button" className={styles.clearAnswer} disabled={Boolean(pending)} onClick={() => setAnswers(current => { const next = { ...current }; delete next[question.id]; return next })}>Clear answer</button> : null}
      </article> : <div className={styles.empty}><BookOpen aria-hidden="true" size={26} /><h3>No questions here</h3><button type="button" className={styles.secondaryButton} onClick={() => setQuestionFilter("all")}>Show all</button></div>}
      <div className={styles.playerFooter}><button type="button" className={styles.iconButton} aria-label="Previous question" title="Previous question" disabled={activeIndex === 0 || paused || Boolean(pending)} onClick={() => changeQuestion(activeIndex - 1)}><ChevronLeft size={19} /></button><span>{filteredQuestions.length ? activeIndex + 1 : 0} / {filteredQuestions.length}</span>{activeIndex + 1 < filteredQuestions.length ? <button type="button" className={styles.primaryButton} disabled={paused || Boolean(pending)} onClick={() => changeQuestion(activeIndex + 1)}>Next<ChevronRight aria-hidden="true" size={16} /></button> : phase === "run" ? <button type="button" className={styles.primaryButton} disabled={!answeredCount || Boolean(pending) || paused} onClick={finishSession}>{pending === "submit" ? <Loader2 className="animate-spin" aria-hidden="true" size={16} /> : <Check aria-hidden="true" size={16} />}Finish</button> : <button type="button" className={styles.secondaryButton} onClick={() => setShowReview(false)}>Done</button>}</div>
      {confirmFinish ? <div className={styles.finishConfirm} role="alert"><span>{questions.length - answeredCount} unanswered</span><button type="button" className={styles.secondaryButton} disabled={Boolean(pending)} onClick={() => { setQuestionFilter("unanswered"); setQuestionIndex(0); setConfirmFinish(false) }}>Review</button><button type="button" className={styles.primaryButton} disabled={Boolean(pending)} onClick={submitAttempt}>{pending === "submit" ? "Saving…" : "Finish anyway"}</button></div> : null}
    </> : null}
    {draftStatus ? <p className={styles.draftStatus} role="status">{draftStatus}</p> : null}
  </div>
}

function formatDuration(totalSeconds: number) {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`
}

function elapsedSince(startedAt: number) {
  return startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0
}

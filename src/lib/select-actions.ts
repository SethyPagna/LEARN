/**
 * What the select-to-act pill does with a passage. Each action is a short
 * chain over LEARN's own endpoints; the fetch helper is passed in, so the
 * chains run in tests without a browser.
 *
 * Local first: "Term: meaning" lines and Q:/A: pairs are read straight from
 * the passage, so a quiz or a set of review cards costs no AI call. AI is
 * asked only when the passage has no such structure, and only when a
 * provider is ready (the pill hides the action otherwise).
 */
import { assessmentOutputInstruction, type GeneratedQuestion } from "./ai/assessment-output"
import { isProviderReady, type AiGatewayProviderStatus } from "./ai/gateway-readiness"
import { buildInsertBackPayload } from "./ai/insert-back"
import { htmlToDesignSpec, specHasContent } from "./design/from-content"
import { designFromSpec } from "./design/layout"
import { parseTextToSpec } from "./design/spec"
import { buildChatDraftPayload, parseThreadTitle } from "./social-features"

export type FetchJson = <T>(path: string, init?: RequestInit) => Promise<T>

export interface Passage {
  /** The selected words, already cleaned (see `cleanSelectionText`). */
  text: string
  /** The same selection as HTML: keeps headings and lists for slides. */
  html?: string
  /** Title of the note or doc it came from. */
  title: string
  /** The project kind it came from, e.g. "notes" or "docs". */
  kind: string
}

export interface StudyPair {
  prompt: string
  answer: string
  from: "term" | "question"
}

/** A quiz needs a few questions, and each question two wrong answers from its neighbours. */
export const MIN_QUIZ_QUESTIONS = 3
export const MAX_QUIZ_QUESTIONS = 20
const MAX_PAIRS = 40
const MAX_CHOICES = 4
const CHOICE_IDS = ["a", "b", "c", "d"]

const BULLET = /^(?:[-*•+▪◦]|\d+[.)])\s+/
const QUESTION_LINE = /^q(?:uestion)?\s*\d*\s*:\s*(.+)$/i
const ANSWER_LINE = /^a(?:nswer)?\s*:\s*(.+)$/i
const COLON_PAIR = /^([^:]{1,60}):\s+(\S.*)$/
const DASH_PAIR = /^(.{1,60}?)\s+[—–-]\s+(\S.*)$/
const EMPHASIS = /^[*_`"“]+|[*_`"”]+$/g
// A RegExp object, not a literal: the ES6 target rejects `\p{…}` in literals.
const WORDLIKE = new RegExp("\\p{L}|\\p{N}", "u")

function tidy(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function sameText(left: string, right: string) {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase()
}

/** A term is a short label (six words at most), not a sentence that happens to hold a colon. */
function termOf(raw: string) {
  const term = tidy(raw).replace(EMPHASIS, "").trim()
  return term && term.split(" ").length <= 6 && WORDLIKE.test(term) ? term : ""
}

/**
 * The study pairs a passage spells out: "Term: meaning" and "Term – meaning"
 * lines (bullets allowed), and "Q: …" lines answered by an "A: …" line.
 * Repeats of a prompt are dropped.
 */
export function extractStudyPairs(text: string): StudyPair[] {
  const pairs: StudyPair[] = []
  const seen = new Set<string>()
  let question = ""
  const add = (prompt: string, answer: string, from: StudyPair["from"]) => {
    const key = prompt.toLocaleLowerCase()
    if (!prompt || !answer || sameText(prompt, answer) || seen.has(key) || pairs.length >= MAX_PAIRS) return
    seen.add(key)
    pairs.push({ prompt: prompt.slice(0, 500), answer: answer.slice(0, 500), from })
  }
  for (const raw of text.split("\n")) {
    const line = tidy(raw).replace(BULLET, "")
    if (!line) continue
    const asked = QUESTION_LINE.exec(line)
    if (asked) {
      question = tidy(asked[1])
      continue
    }
    const answered = ANSWER_LINE.exec(line)
    if (answered) {
      if (question) add(question, tidy(answered[1]), "question")
      question = ""
      continue
    }
    question = ""
    const pair = COLON_PAIR.exec(line) || DASH_PAIR.exec(line)
    const term = pair ? termOf(pair[1]) : ""
    if (pair && term) add(term, tidy(pair[2]), "term")
  }
  return pairs
}

/** The same slot for the same question every time, so the right answer is not always first. */
function stableSlot(text: string, count: number) {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0
  return Math.abs(hash) % count
}

/**
 * Multiple choice without AI. A term is asked for by its meaning, a question
 * as written; the wrong answers are the neighbouring terms (or answers) of
 * the same passage. Kinds with fewer than three pairs are left out, since
 * their questions would have a single wrong answer.
 */
export function localQuizQuestions(pairs: readonly StudyPair[], topic: string): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = []
  for (const from of ["term", "question"] as const) {
    const candidates = pairs.filter((pair) => pair.from === from)
    const answersByQuestion = new Map<string, Set<string>>()
    for (const pair of candidates) {
      const ask = tidy(from === "term" ? pair.answer : pair.prompt).toLocaleLowerCase()
      const answers = answersByQuestion.get(ask) || new Set<string>()
      answers.add(tidy(from === "term" ? pair.prompt : pair.answer).toLocaleLowerCase())
      answersByQuestion.set(ask, answers)
    }
    // The same meaning attached to different terms has no single correct
    // multiple-choice answer. Keep those pairs for cards, not a local quiz.
    const group = candidates.filter(pair => answersByQuestion.get(tidy(from === "term" ? pair.answer : pair.prompt).toLocaleLowerCase())?.size === 1)
    if (group.length < MIN_QUIZ_QUESTIONS) continue
    const solutions = group.map((pair) => (from === "term" ? pair.prompt : pair.answer))
    group.forEach((pair, index) => {
      const ask = from === "term" ? pair.answer : pair.prompt
      const right = solutions[index]
      const wrong: string[] = []
      for (let step = 1; step < group.length && wrong.length < MAX_CHOICES - 1; step += 1) {
        const candidate = solutions[(index + step) % group.length]
        if (!sameText(candidate, right) && !wrong.some((picked) => sameText(picked, candidate))) wrong.push(candidate)
      }
      if (wrong.length < 2) return
      const slot = stableSlot(ask, wrong.length + 1)
      const texts = [...wrong.slice(0, slot), right, ...wrong.slice(slot)]
      questions.push({
        question: ask,
        choices: texts.map((choice, choiceIndex) => ({ id: CHOICE_IDS[choiceIndex], text: choice })),
        correct_answer_id: CHOICE_IDS[slot],
        explanation: from === "term" ? `${pair.prompt}: ${pair.answer}` : "",
        topic,
      })
    })
  }
  return questions.slice(0, MAX_QUIZ_QUESTIONS)
}

/** A short stable id, so making cards from the same lines twice updates them instead of doubling them. */
function cardKey(text: string) {
  let first = 0x811c9dc5
  let second = 0x9e3779b1
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x5bd1e995)
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`
}

export function localReviewCards(pairs: readonly StudyPair[], title: string) {
  const topic = title.slice(0, 80) || "General"
  return pairs.map((pair) => ({
    sourceId: `selection:${cardKey(`${pair.prompt}\n${pair.answer}`)}`,
    title: title.slice(0, 160),
    prompt: pair.prompt,
    answer: pair.answer,
    topic,
  }))
}

/** What the pill can do with this passage without calling AI. */
export function planPassage(text: string) {
  const pairs = extractStudyPairs(text)
  return {
    pairs,
    quizLocally: localQuizQuestions(pairs, "").length >= MIN_QUIZ_QUESTIONS,
    cardsLocally: pairs.length > 0,
  }
}

export interface ProviderList {
  items?: AiGatewayProviderStatus[]
  runtimeItems?: AiGatewayProviderStatus[]
}

/** The same test the AI tutor uses: one enabled provider with a key that has not failed. */
export function aiReadyFrom(response: ProviderList) {
  return [...(response.items || []), ...(response.runtimeItems || [])].some(isProviderReady)
}

export function passageTitle(passage: Pick<Passage, "title">) {
  return tidy(passage.title).slice(0, 120) || "Untitled"
}

function kindLabel(kind: string) {
  return kind === "docs" ? "Docs" : "Notes"
}

async function post<T>(fetchJson: FetchJson, path: string, body: unknown) {
  return fetchJson<T>(path, { method: "POST", body: JSON.stringify(body) })
}

type AiTarget = "quiz" | "flashcards"

const AI_REQUEST: Record<AiTarget, string> = {
  quiz: "Create a playable multiple-choice quiz from this passage, with a short explanation for each answer.",
  flashcards: "Create review flashcards from this passage: one clear question per card and a short answer.",
}

/**
 * One AI request, and one retry when the reply is not the JSON asked for (a
 * model sometimes answers in prose). A provider that is not set up is not
 * retried.
 */
async function askAiFor(fetchJson: FetchJson, target: AiTarget, passage: Passage) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await post<{ status?: string; text?: string }>(fetchJson, "/api/ai/chat", {
      message: attempt ? `${AI_REQUEST[target]} Reply with the JSON only.` : AI_REQUEST[target],
      context: `${assessmentOutputInstruction(target)}\n\n${passage.text}`,
      mode: target,
      provider: "auto",
    })
    if (reply.status !== "ok" || !reply.text) throw new Error("AI isn't available right now.")
    try {
      return buildInsertBackPayload(target, reply.text, passageTitle(passage))
    } catch {
      // Asked again below with a firmer instruction.
    }
  }
  throw new Error(target === "quiz" ? "AI couldn't turn this into a quiz. Try a shorter passage." : "AI couldn't turn this into cards. Try a shorter passage.")
}

export interface SavedQuiz {
  id: string
  title: string
  questions?: unknown[]
}

/** A saved quiz from the passage: local when it spells out pairs, AI otherwise. */
export async function makeQuiz(fetchJson: FetchJson, passage: Passage, options: { aiReady: boolean }) {
  const title = passageTitle(passage)
  const local = localQuizQuestions(extractStudyPairs(passage.text), title)
  let body: Record<string, unknown>
  if (local.length >= MIN_QUIZ_QUESTIONS) {
    body = { title, topic: kindLabel(passage.kind), source: "selection", questions: local }
  } else if (options.aiReady) {
    body = (await askAiFor(fetchJson, "quiz", passage)).body
  } else {
    throw new Error("Write a few “Term: meaning” lines to make a quiz.")
  }
  const { item } = await post<{ item: SavedQuiz | null }>(fetchJson, "/api/quizzes", body)
  if (!item?.id) throw new Error("The quiz couldn't be saved.")
  return { quiz: item, usedAi: body.source === "ai" }
}

/** Review cards from the passage, due now. Returns how many were added. */
export async function makeCards(fetchJson: FetchJson, passage: Passage, options: { aiReady: boolean }) {
  const pairs = extractStudyPairs(passage.text)
  let items: unknown[]
  if (pairs.length) items = localReviewCards(pairs, passageTitle(passage))
  else if (options.aiReady) items = (await askAiFor(fetchJson, "flashcards", passage)).body.items as unknown[]
  else throw new Error("Write “Term: meaning” lines to make cards.")
  const { item } = await post<{ item?: { count?: number } }>(fetchJson, "/api/reviews", { items })
  return { count: item?.count ?? items.length }
}

/** The passage laid out as a slide deck: a cover with the note's title, then a page per heading. */
export function passageDesign(passage: Passage) {
  const title = passageTitle(passage)
  let spec = passage.html ? htmlToDesignSpec(passage.html, { title }) : null
  if (!spec || !specHasContent(spec) || spec.pages.length < 2) spec = parseTextToSpec(passage.text, { title })
  if (!specHasContent(spec)) return null
  return designFromSpec(spec, { name: title, format: "presentation" })
}

export async function makeSlides(fetchJson: FetchJson, passage: Passage) {
  const design = passageDesign(passage)
  if (!design) throw new Error("There's nothing here to lay out.")
  await post(fetchJson, "/api/canvas", { id: design.id, title: design.name, content: design })
  return { id: design.id }
}

export interface ChatThreadSummary {
  id?: string
  title?: string | null
  group_id?: string | null
  dm_peer_id?: string | null
  dm_peer_name?: string | null
}

export interface ChatTarget {
  threadId: string
  name: string
  group: boolean
  /** The thread's stored title, which carries its channel. */
  title: string
}

export const CHAT_TARGET_LIMIT = 6

/** Recent conversations with other people, newest first. Notes-to-self threads are left out. */
export function chatTargets(threads: readonly ChatThreadSummary[], groups: readonly { id: string; name: string }[], limit = CHAT_TARGET_LIMIT): ChatTarget[] {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]))
  return threads
    .filter((thread) => thread.id && (thread.dm_peer_id || thread.group_id))
    .slice(0, limit)
    .map((thread) => ({
      threadId: String(thread.id),
      name: thread.dm_peer_name || (thread.group_id ? groupNames.get(thread.group_id) : "") || parseThreadTitle(thread.title || "").title,
      group: Boolean(thread.group_id),
      title: thread.title || "",
    }))
}

/** The passage as a chat message, signed with the note it came from. */
export function shareMessage(passage: Passage) {
  const title = tidy(passage.title)
  return title && !/^untitled\b/i.test(title) ? `${passage.text}\n\n— ${title}` : passage.text
}

export async function shareToChat(fetchJson: FetchJson, target: ChatTarget, passage: Passage) {
  const { channel, title } = parseThreadTitle(target.title)
  const payload = buildChatDraftPayload({ body: shareMessage(passage), channel, title, intent: "update", threadId: target.threadId })
  const sent = await post<{ threadId?: string }>(fetchJson, "/api/chat", payload)
  return { threadId: sent.threadId || target.threadId }
}

/** A live game of the quiz, with its invite card posted in the chat. */
export async function hostGame(fetchJson: FetchJson, target: ChatTarget, quiz: SavedQuiz) {
  const { item } = await post<{ item?: { code?: string } }>(fetchJson, "/api/live-sessions", { quizId: quiz.id, title: quiz.title, threadId: target.threadId })
  if (!item?.code) throw new Error("The game couldn't start.")
  return { code: item.code }
}

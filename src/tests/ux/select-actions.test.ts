import assert from "node:assert/strict"
import test from "node:test"
import { generatedQuizQuestions } from "../../lib/ai/assessment-output"
import {
  aiReadyFrom,
  chatTargets,
  extractStudyPairs,
  hostGame,
  localQuizQuestions,
  localReviewCards,
  makeCards,
  makeQuiz,
  makeSlides,
  passageDesign,
  planPassage,
  shareMessage,
  shareToChat,
  type FetchJson,
  type Passage,
} from "../../lib/select-actions"

const CELLS = [
  "Mitochondria: makes energy for the cell",
  "- Ribosome: builds proteins from amino acids",
  "**Nucleus** – holds the cell's DNA",
  "Cell membrane - controls what enters and leaves",
].join("\n")

function passage(text: string, extra: Partial<Passage> = {}): Passage {
  return { text, title: "Cell biology", kind: "notes", ...extra }
}

/** A fake of the app's fetch helper: records every call and answers from a script. */
function fakeFetch(answer: (path: string, body: Record<string, unknown>, call: number) => unknown) {
  const calls: Array<{ path: string; method: string; body: Record<string, unknown> }> = []
  const fetchJson = (async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    calls.push({ path, method: init?.method || "GET", body })
    const reply = answer(path, body, calls.length)
    if (reply instanceof Error) throw reply
    return reply
  }) as FetchJson
  return { fetchJson, calls }
}

test("study pairs are read from term lines, dashes, bullets and Q/A pairs", () => {
  const pairs = extractStudyPairs([
    CELLS,
    "Q: What do plants make in photosynthesis?",
    "A: Glucose and oxygen",
    "A: an answer with no question is ignored",
    "See https://example.com for more",
    "Meet at 10:30 tomorrow",
    "This whole long sentence is far too wordy to be a term: so it is skipped",
    "Ribosome: a repeated term is dropped",
  ].join("\n"))
  assert.deepEqual(pairs.map((pair) => [pair.from, pair.prompt, pair.answer]), [
    ["term", "Mitochondria", "makes energy for the cell"],
    ["term", "Ribosome", "builds proteins from amino acids"],
    ["term", "Nucleus", "holds the cell's DNA"],
    ["term", "Cell membrane", "controls what enters and leaves"],
    ["question", "What do plants make in photosynthesis?", "Glucose and oxygen"],
  ])
  assert.deepEqual(extractStudyPairs("Plain prose with no structure at all."), [])
})

test("a local quiz asks each term by its meaning, with valid, varied multiple choice", () => {
  const questions = localQuizQuestions(extractStudyPairs(CELLS), "Cell biology")
  assert.equal(questions.length, 4)
  assert.doesNotThrow(() => generatedQuizQuestions(questions), "the same validator as AI quizzes accepts every question")
  for (const question of questions) {
    const right = question.choices.find((choice) => choice.id === question.correct_answer_id)
    assert.ok(right, "the answer id matches a choice")
    assert.ok(question.explanation.startsWith(`${right.text}: `), "the explanation restates the pair")
    assert.equal(new Set(question.choices.map((choice) => choice.text.toLowerCase())).size, question.choices.length, "no repeated choices")
    assert.ok(question.choices.length >= 3 && question.choices.length <= 4)
    assert.equal(question.topic, "Cell biology")
  }
  assert.equal(questions[0].question, "makes energy for the cell")
  assert.ok(new Set(questions.map((question) => question.correct_answer_id)).size > 1, "the right answer is not always in the same slot")
  const two = extractStudyPairs("Atom: the smallest unit of an element\nIon: an atom with a charge")
  assert.equal(two.length, 2)
  assert.deepEqual(localQuizQuestions(two, ""), [], "two pairs are too few for multiple choice")
})

test("cards keep a stable id per pair, so making them twice updates instead of doubling", () => {
  const pairs = extractStudyPairs(CELLS)
  const first = localReviewCards(pairs, "Cell biology")
  const again = localReviewCards(extractStudyPairs(CELLS), "Cell biology")
  assert.deepEqual(first.map((card) => card.sourceId), again.map((card) => card.sourceId))
  assert.equal(new Set(first.map((card) => card.sourceId)).size, first.length)
  assert.deepEqual(first[0], { sourceId: first[0].sourceId, title: "Cell biology", prompt: "Mitochondria", answer: "makes energy for the cell", topic: "Cell biology" })
})

test("the plan says what works without AI", () => {
  assert.deepEqual({ ...planPassage(CELLS), pairs: undefined }, { pairs: undefined, quizLocally: true, cardsLocally: true })
  assert.deepEqual({ ...planPassage("Osmosis: water moving across a membrane"), pairs: undefined }, { pairs: undefined, quizLocally: false, cardsLocally: true })
  assert.deepEqual({ ...planPassage("Just a thought about cells."), pairs: undefined }, { pairs: undefined, quizLocally: false, cardsLocally: false })
})

test("AI counts as ready only with an enabled provider that has a key and has not failed", () => {
  assert.equal(aiReadyFrom({ items: [], runtimeItems: [] }), false)
  assert.equal(aiReadyFrom({ items: [{ enabled: false, has_key: true }, { enabled: true, has_key: false }, { enabled: true, has_key: true, last_status: "error" }] }), false)
  assert.equal(aiReadyFrom({ items: [], runtimeItems: [{ enabled: true, has_key: true, last_status: "untested" }] }), true)
  assert.equal(aiReadyFrom({ items: [{ enabled: true, requires_key: false }] }), true)
})

test("Quiz me saves a local quiz without calling AI", async () => {
  const { fetchJson, calls } = fakeFetch(() => ({ item: { id: "quiz_1", title: "Cell biology" } }))
  const result = await makeQuiz(fetchJson, passage(CELLS), { aiReady: true })
  assert.deepEqual(result, { quiz: { id: "quiz_1", title: "Cell biology" }, usedAi: false })
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ["POST /api/quizzes"])
  assert.equal(calls[0].body.source, "selection")
  assert.equal(calls[0].body.topic, "Notes")
  assert.equal((calls[0].body.questions as unknown[]).length, 4)
})

test("Quiz me asks AI for prose, retrying once when the reply is not a quiz", async () => {
  const quiz = { title: "Cells", questions: [{ question: "What makes energy?", choices: [{ id: "a", text: "Mitochondria" }, { id: "b", text: "Ribosome" }], correct_answer_id: "a", explanation: "" }] }
  const { fetchJson, calls } = fakeFetch((path, _body, call) => {
    if (path === "/api/ai/chat") return { status: "ok", text: call === 1 ? "Sure! Here are some questions…" : JSON.stringify(quiz) }
    return { item: { id: "quiz_ai", title: "Cells" } }
  })
  const prose = passage("Cells turn food into energy inside their mitochondria, and ribosomes build proteins.")
  const result = await makeQuiz(fetchJson, prose, { aiReady: true })
  assert.equal(result.usedAi, true)
  assert.deepEqual(calls.map((call) => call.path), ["/api/ai/chat", "/api/ai/chat", "/api/quizzes"])
  assert.equal(calls[0].body.mode, "quiz")
  assert.equal(calls[0].body.provider, "auto")
  assert.ok(String(calls[0].body.context).endsWith(prose.text), "the passage is sent as context after the JSON instructions")
  assert.match(String(calls[1].body.message), /JSON only/)
  assert.equal(calls[2].body.source, "ai", "the server validates AI questions again")
})

test("Quiz me stops when AI is not set up, and never asks AI when it is not ready", async () => {
  const setup = fakeFetch(() => ({ status: "setup_required", text: "No AI provider is configured yet." }))
  await assert.rejects(makeQuiz(setup.fetchJson, passage("Plain prose about cells and energy."), { aiReady: true }), /AI isn't available/)
  assert.deepEqual(setup.calls.map((call) => call.path), ["/api/ai/chat"], "no retry and nothing saved")

  const offline = fakeFetch(() => ({}))
  await assert.rejects(makeQuiz(offline.fetchJson, passage("Plain prose about cells and energy."), { aiReady: false }), /Term: meaning/)
  assert.equal(offline.calls.length, 0)
})

test("Cards adds local pairs as due review cards", async () => {
  const { fetchJson, calls } = fakeFetch(() => ({ item: { created: [], count: 4 } }))
  assert.deepEqual(await makeCards(fetchJson, passage(CELLS), { aiReady: false }), { count: 4 })
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ["POST /api/reviews"])
  assert.equal((calls[0].body.items as unknown[]).length, 4)
})

test("Cards asks AI for prose when it is ready", async () => {
  const { fetchJson, calls } = fakeFetch((path) => path === "/api/ai/chat"
    ? { status: "ok", text: JSON.stringify({ title: "Cells", cards: [{ prompt: "What makes energy?", answer: "Mitochondria" }] }) }
    : { item: { count: 1 } })
  assert.deepEqual(await makeCards(fetchJson, passage("Cells make energy in mitochondria."), { aiReady: true }), { count: 1 })
  assert.deepEqual(calls.map((call) => call.path), ["/api/ai/chat", "/api/reviews"])
  assert.equal(calls[0].body.mode, "flashcards")
})

test("Slides lays the passage out as a deck and saves it as a design", async () => {
  const design = passageDesign(passage("", { html: "<h2>Organelles</h2><ul><li><p>Mitochondria: makes energy</p></li><li><p>Ribosome: builds proteins</p></li></ul><h2>Membranes</h2><p>They control what enters.</p>" }))
  assert.ok(design)
  assert.equal(design.name, "Cell biology")
  assert.ok(design.pages.length >= 3, "a cover, then a page per heading")

  const { fetchJson, calls } = fakeFetch(() => ({ item: {} }))
  const { id } = await makeSlides(fetchJson, passage(CELLS))
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ["POST /api/canvas"])
  assert.equal(calls[0].body.id, id)
  assert.equal((calls[0].body.content as { pages: unknown[] }).pages.length >= 2, true)
})

test("chat targets are recent conversations with people, named the way the inbox names them", () => {
  const targets = chatTargets([
    { id: "t_me", title: "#general - Study room" },
    { id: "t_dm", title: "#general - Study room", dm_peer_id: "u2", dm_peer_name: "Dara Sok" },
    { id: "t_group", title: "#biology - Lab", group_id: "g1" },
    { id: "t_lost", title: "#math - Proofs", group_id: "g_gone" },
  ], [{ id: "g1", name: "Bio squad" }])
  assert.deepEqual(targets.map((target) => [target.threadId, target.name, target.group]), [
    ["t_dm", "Dara Sok", false],
    ["t_group", "Bio squad", true],
    ["t_lost", "Proofs", true],
  ])
  assert.equal(chatTargets(Array.from({ length: 9 }, (_, index) => ({ id: `t${index}`, dm_peer_id: "u" })), []).length, 6)
})

test("Share posts the passage into the chosen thread, signed with its note", async () => {
  assert.equal(shareMessage(passage("Cells are small.")), "Cells are small.\n\n— Cell biology")
  assert.equal(shareMessage(passage("Cells are small.", { title: "Untitled note" })), "Cells are small.")

  const { fetchJson, calls } = fakeFetch(() => ({ threadId: "t_group", messageId: "m1" }))
  const target = chatTargets([{ id: "t_group", title: "#biology - Lab", group_id: "g1" }], [{ id: "g1", name: "Bio squad" }])[0]
  assert.deepEqual(await shareToChat(fetchJson, target, passage("Cells are small.")), { threadId: "t_group" })
  assert.equal(calls[0].path, "/api/chat")
  assert.equal(calls[0].body.threadId, "t_group")
  assert.equal(calls[0].body.body, "[update] Cells are small.\n\n— Cell biology")
  assert.deepEqual((calls[0].body.metadata as { channel: string }).channel, "#biology")
})

test("Play hosts a live game of the quiz and posts its invite in the chat", async () => {
  const target = chatTargets([{ id: "t_dm", dm_peer_id: "u2", dm_peer_name: "Dara Sok" }], [])[0]
  const { fetchJson, calls } = fakeFetch(() => ({ item: { id: "live_1", code: "QX7K2P" } }))
  assert.deepEqual(await hostGame(fetchJson, target, { id: "quiz_1", title: "Cell biology" }), { code: "QX7K2P" })
  assert.deepEqual(calls[0], { path: "/api/live-sessions", method: "POST", body: { quizId: "quiz_1", title: "Cell biology", threadId: "t_dm" } })

  const broken = fakeFetch(() => ({ item: {} }))
  await assert.rejects(hostGame(broken.fetchJson, target, { id: "quiz_1", title: "Cell biology" }), /couldn't start/)
})

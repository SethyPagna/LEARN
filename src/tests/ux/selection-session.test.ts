import assert from "node:assert/strict"
import test from "node:test"
import { makeCards, makeQuiz, type FetchJson } from "../../lib/select-actions"
import { createSelectionCache, guardSelectionFetch } from "../../lib/selection-session"

test("selection resources are shared within an account, never between accounts", async () => {
  const cache = createSelectionCache<string[]>(60_000)
  let resolveFirst!: (value: string[]) => void
  const first = cache.load("first-user", () => new Promise(resolve => { resolveFirst = resolve }))
  assert.equal(cache.load("first-user", () => { throw new Error("duplicate read") }), first)
  const second = cache.load("second-user", async () => ["second-user-chat"])
  assert.notEqual(second, first)
  resolveFirst(["first-user-chat"])
  assert.deepEqual(await second, ["second-user-chat"])
  cache.invalidate("first-user")
  assert.equal(cache.load("second-user", () => { throw new Error("wrong-account invalidation") }), second)
  cache.invalidate("second-user")
  assert.deepEqual(await cache.load("second-user", async () => ["new-chat"]), ["new-chat"])
})

for (const action of ["quiz", "cards"] as const) {
  test(`a cancelled ${action} cannot save a delayed AI result`, async () => {
    const calls: string[] = []
    let current = true
    let resolveAi!: (value: unknown) => void
    const fetchJson: FetchJson = async <T>(path: string): Promise<T> => {
      calls.push(path)
      const response = await new Promise<unknown>(resolve => { resolveAi = resolve })
      return response as T
    }
    const fetchCurrent = guardSelectionFetch(fetchJson, () => current)
    const operation = action === "quiz" ? makeQuiz : makeCards
    const pending = operation(fetchCurrent, { text: "A passage in ordinary prose about cells.", title: "Cells", kind: "notes" }, { aiReady: true })
    current = false
    resolveAi({ status: "ok", text: JSON.stringify(action === "quiz"
      ? { title: "Cells", questions: [{ question: "What makes energy?", choices: [{ id: "a", text: "Mitochondria" }, { id: "b", text: "Ribosome" }], correct_answer_id: "a" }] }
      : { title: "Cells", cards: [{ prompt: "What makes energy?", answer: "Mitochondria" }] }) })
    await assert.rejects(pending, /cancelled/)
    assert.deepEqual(calls, ["/api/ai/chat"], "no persistence request after cancellation")
  })
}

test("a cancelled action cannot retry a malformed AI response", async () => {
  let current = true
  const calls: string[] = []
  const fetchJson: FetchJson = async <T>(path: string): Promise<T> => {
    calls.push(path)
    current = false
    return { status: "ok", text: "not a quiz" } as T
  }
  await assert.rejects(makeQuiz(guardSelectionFetch(fetchJson, () => current), { text: "Ordinary prose about cells.", title: "Cells", kind: "notes" }, { aiReady: true }), /cancelled/)
  assert.deepEqual(calls, ["/api/ai/chat"])
})

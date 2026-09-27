import assert from "node:assert/strict"
import test from "node:test"
import { api, OFFLINE_MESSAGE, PROJECTS_CHANGED_EVENT } from "../../components/learn/api"

test("a dropped connection reads as plain words, and an abort stays an abort", async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch") }
    await assert.rejects(api("/api/notes"), (error: unknown) => error instanceof Error && error.message === OFFLINE_MESSAGE)
    globalThis.fetch = async () => { throw new DOMException("The user aborted a request.", "AbortError") }
    await assert.rejects(api("/api/notes"), (error: unknown) => error instanceof DOMException && error.name === "AbortError")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("project lists refresh after successful saves, never after reads or failed writes", async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  const events: string[] = []
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: (event: Event) => { events.push(event.type); return true } } })
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ item: { id: "review", title: "Renamed" } }), { status: 200 })
    for (const path of ["/api/canvas", "/api/docs", "/api/slides", "/api/sheets"]) {
      await api(path, { method: "PUT", body: JSON.stringify({ id: "review", title: "Renamed" }) })
    }
    assert.deepEqual(events, Array(4).fill(PROJECTS_CHANGED_EVENT))
    await api("/api/canvas?view=summary")
    await api("/api/settings", { method: "PUT" })
    await api("/api/canvas/share", { method: "POST" })
    assert.equal(events.length, 4)
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "Save failed" }), { status: 500 })
    await assert.rejects(api("/api/docs", { method: "PUT" }), /Save failed/)
    assert.equal(events.length, 4)
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
    else Reflect.deleteProperty(globalThis, "window")
  }
})

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createDesignDoc, parseDesign } from "../../lib/design/document"
import { deckDesignId } from "../../lib/design/from-deck"
import { isPresentationFormat, slidesFormatId } from "../../lib/design/formats"
import { isSlidesProject, projectHref, projectShownKind } from "../../components/learn/studio-projects"
import { openDeck } from "../../components/learn/views/deck-opener"

const PROJECT_ROOT = path.resolve(__dirname, "../../..")
const read = (file: string) => fs.readFileSync(path.join(PROJECT_ROOT, file), "utf8")

test("slides are designs in a presentation format; every other design is a canvas", () => {
  assert.equal(isPresentationFormat("presentation"), true)
  assert.equal(isPresentationFormat("presentation-4-3"), true)
  assert.equal(isPresentationFormat("thumbnail"), false, "a 16:9 thumbnail is a social post, not slides")
  assert.equal(isPresentationFormat("custom"), false)
  assert.equal(slidesFormatId("4:3"), "presentation-4-3")
  assert.equal(slidesFormatId("16:9"), "presentation")
  assert.equal(slidesFormatId(undefined), "presentation")

  const slides = { kind: "canvas" as const, id: "design_1", content: createDesignDoc({ format: "presentation" }) }
  const poster = { kind: "canvas" as const, id: "design_2", content: createDesignDoc({ format: "poster" }) }
  const oldDeck = { kind: "slides" as const, id: "deck_1" }
  assert.equal(isSlidesProject(slides), true)
  assert.equal(projectShownKind(slides), "slides")
  assert.equal(projectShownKind(poster), "canvas")
  assert.equal(projectShownKind(oldDeck), "slides", "an old deck is listed as Slides until it is opened")
  assert.equal(projectHref(slides), "/slides?design=design_1")
  assert.equal(projectHref(poster), "/canvas?design=design_2")
  assert.equal(projectHref(oldDeck), "/slides?item=slides%3Adeck_1", "an old deck opens through the converter")
  assert.equal(projectHref({ kind: "canvas", id: "design_3" }), "/canvas?design=design_3", "a design without its content still opens")
})

test("an old deck converts once into a presentation design, archives the deck and reuses the copy", async () => {
  const deck = { id: "deck_abc", title: "Cells", slides: [{ title: "Cells", body: "The unit of life", theme: "plain" }, { title: "Organelles", body: "", speakerNotes: "" }], speaker_notes: { "1": "Point at the diagram" } }
  const saved = new Map<string, string>()
  const calls: string[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || "GET"
    calls.push(`${method} ${url}`)
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
    if (url.startsWith("/api/canvas?id=")) {
      const id = decodeURIComponent(url.slice("/api/canvas?id=".length))
      return saved.has(id) ? json({ item: { id, content: JSON.parse(saved.get(id)!).content } }) : json({ error: "That canvas was not found." }, 404)
    }
    if (url === "/api/slides" && method === "GET") return json({ items: [deck] })
    if (url === "/api/canvas" && method === "PUT") {
      const body = JSON.parse(String(init?.body))
      saved.set(body.id, String(init?.body))
      return json({ item: { id: body.id, title: body.title } })
    }
    if (url.startsWith("/api/slides?id=") && method === "DELETE") return json({ success: true })
    return json({ error: `Unexpected ${method} ${url}` }, 500)
  }
  try {
    const id = deckDesignId("deck_abc")
    const [first, again] = await Promise.all([openDeck("deck_abc", "4:3"), openDeck("deck_abc", "4:3")])
    assert.equal(first, `/slides?design=${id}&from=deck`)
    assert.equal(again, first, "a remount while converting shares the same run")
    assert.deepEqual(calls, [`GET /api/canvas?id=${id}`, "GET /api/slides", "PUT /api/canvas", "DELETE /api/slides?id=deck_abc"], "one conversion, one write")
    const body = JSON.parse(saved.get(id)!)
    assert.equal(body.title, "Cells")
    const design = parseDesign(JSON.stringify(body.content))
    assert.equal(design.id, id)
    assert.equal(design.format, "presentation-4-3", "the Settings slides aspect sizes the converted deck")
    assert.equal(design.pages.length, 2)
    assert.equal(design.pages[1].notes, "Point at the diagram", "notes saved beside the slides come along")

    calls.length = 0
    assert.equal(await openDeck("deck_abc", "4:3"), `/slides?design=${id}`, "a second open goes to the same copy")
    assert.deepEqual(calls, [`GET /api/canvas?id=${id}`, "DELETE /api/slides?id=deck_abc"], "no second copy is written")

    await assert.rejects(openDeck("deck_gone", "16:9"), /isn't in your Studio any more/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("every way into slides lands in the one design editor", () => {
  const shell = read("src/components/learn/learn-shell.tsx")
  assert.match(shell, /<DeckOpener key=\{openDeckId\}/, "an old deck's link converts it first")
  assert.match(shell, /designView && isEditor && !openDeckId \? <CanvasEditorView/, "/slides?design= and /canvas?design= open the same editor")
  assert.match(shell, /view !== "studio" && view !== "slides" && studioViews\.includes/, "the old slides editor no longer opens")
  assert.match(shell, /view === "slides" \? "Slides"/, "/slides on its own is the Studio lobby, showing Slides")

  const lobby = read("src/components/learn/studio-lobby.tsx")
  assert.match(lobby, /createDesignDoc\(\{ name: title, format: slidesFormatId\(options\.slidesAspect\)/, "Add > Slides makes a presentation design")
  assert.match(lobby, /onOpen\("\/canvas\?new=1"\)/, "Add > Canvas asks for a size first")
  assert.doesNotMatch(lobby, /"\/api\/slides"|title: "Your first idea"/, "no new decks are made")

  assert.match(read("src/components/learn/selection-dock.tsx"), /finish\(`\/slides\?design=/)
  assert.match(read("src/components/learn/design/design-editor.tsx"), /const presentation = isPresentationFormat\(api\.design\.format\)/)
  const home = read("src/components/learn/design/designs-home.tsx")
  assert.match(home, /picker \? designFormats\.filter\(\(format\) => format\.group !== "presentation"\)/, "the canvas size picker leaves slides to Slides")
})

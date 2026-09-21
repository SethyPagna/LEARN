/**
 * The rendered share page, and the payload it renders.
 *
 * `/share/[token]` is a server component, so most of what matters about it is
 * structural and is pinned by reading the file: that it is not a client
 * component, that every rejection is `notFound()`, that it renders through the
 * existing themed renderer, and that a viewer link is never marked up with the
 * answer key. Those are exactly the properties that fail silently.
 *
 * The half that *can* be executed is executed: the payload loader is driven
 * through the real SQL boundary, because "the role decides whether the quiz's
 * `correct_answer_id` is in the payload" is a security rule, not a rendering
 * preference — and it is now the API's rule as well as the page's.
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { installDatabaseStub, primeDatabase, readJson, request, stubSessionLookup } from "../api/harness"
import { readSharedContentPayload } from "../../lib/data"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const PAGE_PATH = path.join(PROJECT_ROOT, "src", "app", "share", "[token]", "page.tsx")

const QUIZ_ID = "quiz_shared_1"
const CONTENT_ITEM_ID = "content_quiz_1"

const QUIZ_ROW = {
  id: QUIZ_ID,
  workspace_id: "workspace_demo",
  title: "Photosynthesis",
  topic: "Biology",
  description: "How plants make food",
  source: "manual",
  archived_at: null,
}

const QUESTION_ROWS = [
  {
    id: "qq_1",
    quiz_id: QUIZ_ID,
    question: "Which gas do plants absorb?",
    choices: JSON.stringify([{ id: "a", text: "Oxygen" }, { id: "b", text: "Carbon dioxide" }]),
    correct_answer_id: "b",
    topic: "Biology",
    explanation: "CO2 enters through the stomata.",
  },
]

const CONTENT_ITEM_ROW = {
  id: CONTENT_ITEM_ID,
  workspace_id: "workspace_demo",
  owner_user_id: "user_owner",
  item_type: "quiz",
  source_table: "quizzes",
  source_id: QUIZ_ID,
  title: "Photosynthesis",
  visibility: "private",
  archived_at: null,
}

const SHARE_BY_TOKEN = /SELECT \* FROM shared_access\s+WHERE grantee_type = 'public_link' AND grantee_id = \?/

function stubQuizSource(stub: ReturnType<typeof installDatabaseStub>) {
  stub.on(/SELECT \* FROM quizzes WHERE id = \? LIMIT 1/, { rows: [QUIZ_ROW] })
  stub.on(/SELECT \* FROM quiz_questions/, { rows: QUESTION_ROWS })
}

/** One live share-link grant, as the stub would have stored it. */
function stubShareGrant(stub: ReturnType<typeof installDatabaseStub>, role: "viewer" | "editor") {
  stub.on(SHARE_BY_TOKEN, {
    rows: [{
      id: "share_1",
      content_item_id: CONTENT_ITEM_ID,
      grantee_type: "public_link",
      grantee_id: "a".repeat(64),
      role,
      expires_at: null,
      created_at: "2026-01-01 00:00:00",
    }],
  })
}

function questionPayload(payload: Record<string, unknown>) {
  const questions = payload.questions as Record<string, unknown>[]
  assert.ok(Array.isArray(questions) && questions.length, "a quiz payload must carry its questions")
  return questions[0]
}

// ---------------------------------------------------------------------------
// The payload is narrowed by the grant
// ---------------------------------------------------------------------------

test("a viewer link receives the questions without the answer key", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubQuizSource(stub)

    const payload = await readSharedContentPayload("quizzes", QUIZ_ID, "viewer")
    assert.ok(payload)

    const question = questionPayload(payload)
    assert.equal(question.question, "Which gas do plants absorb?")
    assert.deepEqual(question.choices, [{ id: "a", text: "Oxygen" }, { id: "b", text: "Carbon dioxide" }])
    assert.equal(
      Object.prototype.hasOwnProperty.call(question, "correct_answer_id"),
      false,
      "a viewer link must not carry the answer key",
    )
    // The question's own row is still there, so this is a narrowing and not a
    // truncated read.
    assert.equal(payload.title, "Photosynthesis")
    assert.equal(payload.id, QUIZ_ID)
  } finally {
    stub.restore()
  }
})

test("an editor link keeps the answer key, and the role defaults to the narrow one", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubQuizSource(stub)

    const editor = await readSharedContentPayload("quizzes", QUIZ_ID, "editor")
    assert.equal(questionPayload(editor as Record<string, unknown>).correct_answer_id, "b")

    // No role at all is the same as a viewer: a caller that forgets the argument
    // withholds rather than leaks.
    const forgot = await readSharedContentPayload("quizzes", QUIZ_ID)
    assert.equal(Object.prototype.hasOwnProperty.call(questionPayload(forgot as Record<string, unknown>), "correct_answer_id"), false)
  } finally {
    stub.restore()
  }
})

test("the grant's role is what reaches the payload, through the public route", async () => {
  for (const role of ["viewer", "editor"] as const) {
    const stub = installDatabaseStub()
    try {
      await primeDatabase(stub)
      stubSessionLookup(stub)
      stubQuizSource(stub)
      stubShareGrant(stub, role)
      stub.on(/SELECT \* FROM content_items WHERE id = \? LIMIT 1/, { rows: [CONTENT_ITEM_ROW] })

      const { GET } = await import("../../app/api/share/[token]/route")
      const response = await GET(
        request(`/api/share/${"a".repeat(64)}`, { token: null }),
        { params: Promise.resolve({ token: "a".repeat(64) }) },
      )

      assert.equal(response.status, 200)
      const body = await readJson<{ item: { role: string }; payload: Record<string, unknown> }>(response)
      assert.equal(body.item.role, role)

      const question = questionPayload(body.payload)
      assert.equal(
        Object.prototype.hasOwnProperty.call(question, "correct_answer_id"),
        role === "editor",
        `a ${role} link must ${role === "editor" ? "keep" : "withhold"} the answer key`,
      )
    } finally {
      stub.restore()
    }
  }
})

test("the other source tables are unchanged by the role argument", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stub.on(/SELECT \* FROM notes WHERE id = \? LIMIT 1/, {
      rows: [{ id: "note_1", title: "Cell division", content: "Mitosis" }],
    })

    const payload = await readSharedContentPayload("notes", "note_1", "viewer")
    assert.deepEqual(payload, { id: "note_1", title: "Cell division", content: "Mitosis" })

    // An unknown source table still resolves to nothing, so the page 404s rather
    // than rendering a half-shaped item.
    assert.equal(await readSharedContentPayload("not_a_table", "x", "editor"), null)
  } finally {
    stub.restore()
  }
})

// ---------------------------------------------------------------------------
// The page itself
// ---------------------------------------------------------------------------

function readPage(): string {
  assert.ok(fs.existsSync(PAGE_PATH), "src/app/share/[token]/page.tsx must exist")
  return fs.readFileSync(PAGE_PATH, "utf8")
}

/**
 * Assertions about what the page *emits* must not trip over prose: the file
 * documents its own rules, and `dangerouslySetInnerHTML` in a doc comment is not
 * a call.
 */
function readPageCode(): string {
  return readPage().replace(/\/\*[\s\S]*?\*\//g, "")
}

test("the share page is a server component that resolves the token itself", () => {
  const source = readPage()

  assert.doesNotMatch(source, /^"use client"/m, "the page must render on the server")
  assert.doesNotMatch(source, /\buseEffect\b|\buseState\b/, "the page must not be interactive")
  assert.match(source, /await params/, "the token must be read from the route params")
  assert.match(source, /resolveShareToken\(/, "the token must resolve through the data layer")
  assert.match(source, /resolveContentRoleForToken\(/, "the grant's role must be re-checked, not assumed")
  assert.match(source, /readSharedContentPayload\([^)]*role\)/, "the payload must be read under the grant's role")
})

test("every rejection is the 404 page, never an error page", () => {
  const source = readPage()

  assert.match(source, /if \(!item\) notFound\(\)/, "an unresolvable token must 404")
  // The resolution is wrapped, so a database that cannot be reached on a public
  // URL is a 404 rather than a stack trace.
  assert.match(source, /catch \{\s*return null\s*\}/, "resolution failures must collapse to null")

  for (const reason of ["resolveShareToken", "resolveContentRoleForToken", "readSharedContentPayload"]) {
    assert.ok(source.includes(reason), `${reason} must be part of the resolution`)
  }
})

test("the page renders stored content as text, never as markup", () => {
  const source = readPageCode()

  assert.doesNotMatch(source, /dangerouslySetInnerHTML/, "shared content must not become markup")
  assert.doesNotMatch(source, /<iframe/i, "the page must not frame remote content")
  assert.match(source, /AiBlockRenderer/, "blocks must render through the existing themed renderer")
  assert.match(source, /blocksFromDocumentHtml/, "a stored document body must be read by the existing reader")
  assert.match(source, /formatAiResponse/, "a stored note body must be normalized, not rendered raw")
  assert.match(source, /normalizeCanvasDoc/, "a shared canvas must be normalised by the engine")
  assert.match(source, /sanitizeImageUrl|safeColor/, "canvas values must pass the shared validators")
})

test("the answer key is only marked up for an editor link", () => {
  const source = readPage()

  assert.match(source, /revealAnswers=\{item\.role === "editor"\}/, "revealing must be driven by the grant, not a prop")
  assert.match(source, /revealAnswers &&/, "the correct choice and explanation must be gated on that flag")
})

test("the header names the item, its role and a way to sign in", () => {
  const source = readPage()

  assert.match(source, /\{item\.title\}/, "the item title must be shown")
  assert.match(source, /item\.role === "editor" \? "Editor" : "Viewer"/, "the role must be shown as a badge")
  assert.match(source, /href="\/login"/, "a signed-out reader must have a way in")
  assert.match(source, /<h1/, "the item title must be a real heading")
})

// ---------------------------------------------------------------------------
// One share control, two surfaces
// ---------------------------------------------------------------------------

test("one share panel serves both the canvas and the quiz surface", () => {
  const panelPath = path.join(PROJECT_ROOT, "src", "components", "learn", "share-panel.tsx")
  assert.ok(fs.existsSync(panelPath), "the share panel must exist as a shared component")
  const panel = fs.readFileSync(panelPath, "utf8")

  assert.match(panel, /^"use client"/m, "the panel is interactive")
  assert.match(panel, /export function SharePanel\(/, "the panel must be exported for both callers")
  // The copied URL is the rendered page, which is what the reader can open.
  assert.match(panel, /`\$\{origin\}\/share\/\$\{token\}`/, "a copied link must point at the share page")

  for (const [relativePath, source] of [
    ["src/components/learn/views/canvas-editor.tsx", "editor_documents"],
    ["src/components/learn/views/quiz-view.tsx", "quizzes"],
  ] as const) {
    const view = fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8")
    assert.match(view, /import \{ SharePanel \} from "\.\.\/share-panel"/, `${relativePath} must use the shared panel`)
    assert.match(view, /<SharePanel/, `${relativePath} must render the shared panel`)
    assert.ok(view.includes(`sourceTable="${source}"`) || view.includes(`sourceTable={CANVAS_SOURCE_TABLE}`), `${relativePath} must name its source table`)
  }
})

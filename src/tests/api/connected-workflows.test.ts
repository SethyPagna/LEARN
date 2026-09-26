import assert from "node:assert/strict"
import test from "node:test"
import { buildInsertBackPayload } from "../../lib/ai/insert-back"
import { encryptProviderSecret } from "../../lib/ai/provider-admin"
import { installDatabaseStub, primeDatabase, readJson, request, stubSessionLookup, TEST_USER_ROW } from "./harness"

test("AI quiz insertion crosses the real route into playable question storage", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/SELECT \* FROM content_items/, { rows: [{ id: "content_quiz" }] })
    stub.on(/SELECT \* FROM quizzes/, { rows: [{ id: "quiz_1", title: "Cells" }] })
    stub.on(/SELECT \* FROM quiz_questions/, { rows: [{ id: "q_1", question: "Cell boundary?", choices: '[{"id":"a","text":"Membrane"},{"id":"b","text":"Nucleus"}]', correct_answer_id: "a" }] })
    const payload = buildInsertBackPayload("quiz", '{"title":"Cells","questions":[{"question":"Cell boundary?","choices":["Membrane","Nucleus"],"answer":"Membrane"}]}')
    const { POST } = await import("../../app/api/quizzes/route")
    const response = await POST(request(payload.endpoint, { method: "POST", body: payload.body }))
    assert.equal(response.status, 201)
    const body = await readJson<{ item: { questions: Array<{ correct_answer_id: string }> } }>(response)
    assert.equal(body.item.questions[0].correct_answer_id, "a")
    assert.equal(stub.matching(/INSERT INTO quizzes/).length, 1)
    assert.equal(stub.matching(/INSERT INTO quiz_questions/).length, 1)
    assert.equal(stub.matching(/INSERT INTO notes/).length, 0)
    const invalid = await POST(request(payload.endpoint, { method: "POST", body: { title: "Invalid", source: "ai", questions: [{ question: "Missing choices" }] } }))
    assert.equal(invalid.status, 400)
    assert.equal(stub.matching(/INSERT INTO quizzes/).length, 1, "invalid output cannot partially create a quiz")
  } finally { stub.restore() }
})

test("generated cards enter the authenticated review queue", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const payload = buildInsertBackPayload("review-cards", '{"cards":[{"prompt":"Boundary?","answer":"Membrane"}]}')
    const { POST } = await import("../../app/api/reviews/route")
    const response = await POST(request(payload.endpoint, { method: "POST", body: payload.body }))
    assert.equal(response.status, 201)
    const body = await readJson<{ item: { count: number } }>(response)
    assert.equal(body.item.count, 1)
    const writes = stub.matching(/INSERT INTO review_items/)
    assert.equal(writes.length, 1)
    assert.equal(writes[0].params[1], TEST_USER_ROW.id)
    assert.ok(writes[0].params.includes("Membrane"))
  } finally { stub.restore() }
})

test("Vault block read is bounded and constrained to the note owner or admin", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/SELECT b\.\* FROM note_blocks/, (sql, params) => {
      assert.match(sql, /n\.archived_at IS NULL/)
      assert.match(sql, /n\.owner_user_id = \? OR \? = 'admin'/)
      assert.match(sql, /LIMIT 200/)
      assert.deepEqual(params.slice(1), [TEST_USER_ROW.id, "learner"])
      return { rows: params[0] === "own_note" ? [{ id: "block_1", note_id: "own_note", block_type: "text", content: '{"text":"Saved idea"}' }] : [] }
    })
    const { GET } = await import("../../app/api/vault/blocks/route")
    const own = await readJson<{ items: Array<{ content: { text: string } }> }>(await GET(request("/api/vault/blocks?noteId=own_note")))
    assert.equal(own.items[0].content.text, "Saved idea")
    const other = await readJson<{ items: unknown[] }>(await GET(request("/api/vault/blocks?noteId=other_note")))
    assert.deepEqual(other.items, [])
    assert.equal((await GET(request("/api/vault/blocks"))).status, 400)
    assert.equal((await GET(request("/api/vault/blocks?noteId=own_note", { token: null }))).status, 401)
  } finally { stub.restore() }
})

test("chat selection routes only to the selected configured family and reports setup/errors", async () => {
  const stub = installDatabaseStub()
  const previousMistral = process.env.MISTRAL_API_KEY
  delete process.env.MISTRAL_API_KEY
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const secret = await encryptProviderSecret("test-key")
    const providers = ["groq", "mistral"].map((provider) => ({ id: provider, provider, provider_type: "chat", name: provider, endpoint_override: `https://${provider}.test/chat`, default_model: "test", api_key_encrypted: secret, timeout_ms: 3000 }))
    stub.on(/SELECT \* FROM ai_provider_configs/, { rows: providers })
    stub.onHttp(/https:\/\/mistral\.test\/chat/, () => Response.json({ choices: [{ message: { content: "Selected response" } }] }))
    const { POST } = await import("../../app/api/ai/chat/route")
    const makeRequest = () => request("/api/ai/chat", { method: "POST", body: { message: "Explain cells", provider: "mistral" } })
    const success = await POST(makeRequest())
    assert.equal(success.status, 200)
    assert.equal((await readJson(success)).provider, "mistral")
    assert.deepEqual(stub.httpRequests.map((entry) => entry.url), ["https://mistral.test/chat"])
    stub.onHttp(/https:\/\/mistral\.test\/chat/, () => Response.json({ choices: [] }))
    assert.equal((await POST(makeRequest())).status, 502)
    assert.equal(stub.httpRequests.some((entry) => entry.url.includes("groq")), false, "explicit provider must not silently send data to another family")
    stub.on(/SELECT \* FROM ai_provider_configs/, { rows: [providers[0]] })
    const setup = await readJson(await POST(makeRequest()))
    assert.equal(setup.status, "setup_required")
    assert.equal((await POST(request("/api/ai/chat", { method: "POST", body: { message: "Hello", provider: "invented" } }))).status, 400)
  } finally {
    if (previousMistral === undefined) delete process.env.MISTRAL_API_KEY
    else process.env.MISTRAL_API_KEY = previousMistral
    stub.restore()
  }
})

test("Ollama uses only its server-configured endpoint/model without keys or redirects", async () => {
  const stub = installDatabaseStub()
  const previous = { url: process.env.OLLAMA_BASE_URL, model: process.env.OLLAMA_MODEL }
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434"
  process.env.OLLAMA_MODEL = "installed-model"
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.onHttp(/^http:\/\/127\.0\.0\.1:11434\/v1\/chat\/completions$/, (_url, init) => {
      assert.equal(init?.redirect, "error")
      assert.equal(new Headers(init?.headers).has("authorization"), false)
      const body = JSON.parse(String(init?.body))
      assert.equal(body.model, "installed-model")
      return Response.json({ choices: [{ message: { content: "Local answer" } }] })
    })
    const { POST } = await import("../../app/api/ai/chat/route")
    const response = await POST(request("/api/ai/chat", { method: "POST", body: { message: "Explain cells", provider: "ollama", endpoint: "http://169.254.169.254", model: "untrusted-model" } }))
    assert.equal(response.status, 200)
    assert.equal((await readJson(response)).provider, "ollama")
    assert.equal(stub.httpRequests.length, 1)
    const { GET } = await import("../../app/api/ai/providers/route")
    const statuses = await readJson<{ runtimeItems: Array<{ provider: string; requires_key: boolean; has_key: boolean }> }>(await GET(request("/api/ai/providers")))
    const local = statuses.runtimeItems.find((item) => item.provider === "ollama")!
    assert.equal(local.requires_key, false)
    assert.equal(local.has_key, false)
  } finally {
    if (previous.url === undefined) delete process.env.OLLAMA_BASE_URL
    else process.env.OLLAMA_BASE_URL = previous.url
    if (previous.model === undefined) delete process.env.OLLAMA_MODEL
    else process.env.OLLAMA_MODEL = previous.model
    stub.restore()
  }
})

test("activity and private discussion destinations persist content under the authenticated owner", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/SELECT \* FROM calendar_events/, { rows: [{ id: "event_1", title: "Recall", starts_at: "2026-10-01T02:00:00Z", ends_at: "2026-10-01T02:30:00Z" }] })
    stub.on(/SELECT \* FROM learning_spaces/, { rows: [{ id: "space_1", name: "Discuss" }] })
    const activity = buildInsertBackPayload("study-activity", '{"title":"Recall","notes":"Draw, label, then compare.","startsAt":"2026-10-01T02:00:00Z","endsAt":"2026-10-01T02:30:00Z"}')
    const discussion = buildInsertBackPayload("discussion-space", '{"title":"Discuss","description":"Compare evidence and reflect.","visibility":"public"}')
    const calendarRoute = await import("../../app/api/calendar/route")
    const spaceRoute = await import("../../app/api/learning-spaces/route")
    assert.equal((await calendarRoute.POST(request(activity.endpoint, { method: "POST", body: activity.body }))).status, 201)
    assert.equal((await spaceRoute.POST(request(discussion.endpoint, { method: "POST", body: discussion.body }))).status, 201)
    const calendarWrite = stub.matching(/INSERT INTO calendar_events/)[0]
    const spaceWrite = stub.matching(/INSERT INTO learning_spaces/)[0]
    assert.equal(calendarWrite.params[1], TEST_USER_ROW.id)
    assert.ok(calendarWrite.params.includes("Draw, label, then compare."))
    assert.equal(spaceWrite.params[1], TEST_USER_ROW.id)
    assert.ok(spaceWrite.params.includes("Compare evidence and reflect."))
    assert.ok(spaceWrite.params.includes("private"))
    assert.equal((await calendarRoute.POST(request(activity.endpoint, { method: "POST", body: activity.body, token: null }))).status, 401)
    assert.equal((await spaceRoute.POST(request(discussion.endpoint, { method: "POST", body: discussion.body, headers: { origin: "https://other.example" } }))).status, 403)
    assert.equal(stub.matching(/INSERT INTO calendar_events/).length, 1)
    assert.equal(stub.matching(/INSERT INTO learning_spaces/).length, 1)
  } finally { stub.restore() }
})

test("graph and review seeding bound the note query before transferring its rows", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    const { getVaultGraph, listReviewSchedule } = await import("../../lib/data")
    const user = { ...TEST_USER_ROW, role: "learner" as const, preferences: {} }
    await getVaultGraph(user)
    await listReviewSchedule(user)
    const reads = stub.matching(/FROM notes n/)
    assert.equal(reads.length, 2)
    assert.deepEqual(reads.map((read) => read.params), [[TEST_USER_ROW.id, "learner", 5], [TEST_USER_ROW.id, "learner", 6]])
    for (const read of reads) {
      assert.match(read.sql, /LIMIT \?/)
      assert.match(read.sql, /n\.owner_user_id = \? OR \? = 'admin'/)
      assert.match(read.sql, /ORDER BY n\.favorite DESC, n\.updated_at DESC/)
    }
  } finally { stub.restore() }
})

import assert from "node:assert/strict"
import test from "node:test"
import {
  buildProviderAdminSummary,
  createProviderConfigDraftFromPreset,
  decryptProviderSecret,
  encryptProviderSecret,
  maskProviderSecret,
  normalizeProviderConfigInput,
} from "../lib/ai/provider-admin"
import { getTutorModeInstruction } from "../lib/ai/tutor"
import { getPromptTemplate } from "../lib/ai/prompt-library"
import { buildGuidedPrompt, listInsertActions, promptContracts } from "../lib/ai/prompt-builder"
import { buildInsertBackPayload, parseAiJson } from "../lib/ai/insert-back"
import { listProviderPresets, getProviderMetadata, resolveConfiguredProvider } from "../lib/ai/providers"

test("resolveConfiguredProvider selects the requested provider when a key exists", () => {
  const provider = resolveConfiguredProvider({
    AI_PROVIDER_DEFAULT: "google",
    GOOGLE_AI_API_KEY: "test-key",
  })

  assert.equal(provider?.provider, "google")
  assert.equal(provider?.model, getProviderMetadata("google")?.defaultModel)
})

test("resolveConfiguredProvider returns null when no provider key is configured", () => {
  const provider = resolveConfiguredProvider({
    AI_PROVIDER_DEFAULT: "groq",
  })

  assert.equal(provider, null)
})

test("resolveConfiguredProvider builds the Cloudflare AI Gateway endpoint", () => {
  const provider = resolveConfiguredProvider({
    AI_PROVIDER_DEFAULT: "cloudflare",
    CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_AI_GATEWAY_ID: "learn",
    CLOUDFLARE_AI_GATEWAY_TOKEN: "test-token",
  })

  assert.equal(provider?.provider, "cloudflare")
  assert.equal(provider?.model, "@cf/meta/llama-3.1-8b-instruct")
  assert.equal(provider?.endpoint, "https://gateway.ai.cloudflare.com/v1/account/learn/workers-ai/@cf/meta/llama-3.1-8b-instruct")
})

test("provider secrets are encrypted and masked without exposing the raw key", async () => {
  const encrypted = await encryptProviderSecret("secret-provider-key", "test-master-key")

  assert.notEqual(encrypted, "secret-provider-key")
  assert.equal(await decryptProviderSecret(encrypted, "test-master-key"), "secret-provider-key")
  assert.equal(maskProviderSecret("secret-provider-key"), "secr...-key")
})

test("normalizeProviderConfigInput applies safe provider defaults", () => {
  const input = normalizeProviderConfigInput({ provider: "groq", apiKey: "key" })

  assert.equal(input.provider, "groq")
  assert.equal(input.name, "Groq")
  assert.equal(input.defaultModel, "groq/compound")
  assert.equal(input.providerType, "chat")
  assert.equal(input.requestsPerMinute, 18)
  assert.equal(input.endpointOverride, "https://api.groq.com/openai/v1/chat/completions")
})

test("provider preset catalog includes chat and embedding choices", () => {
  const presets = listProviderPresets()

  assert.ok(presets.some((preset) => preset.id === "groq-research" && preset.type === "chat"))
  assert.ok(presets.some((preset) => preset.id === "cohere-embed" && preset.type === "embed"))
})

test("provider preset drafts are ready for encrypted admin storage", () => {
  const preset = listProviderPresets().find((item) => item.id === "groq-research")
  assert.ok(preset)

  const draft = createProviderConfigDraftFromPreset(preset, "stored-api-key")

  assert.equal(draft.name, "Groq Research")
  assert.equal(draft.provider, "groq")
  assert.equal(draft.providerType, "chat")
  assert.equal(draft.apiKey, "stored-api-key")
  assert.equal(draft.priority, 10)
  assert.equal(draft.requestsPerMinute, 18)
})

test("provider admin summary masks secrets and flags degraded routing", () => {
  const summary = buildProviderAdminSummary([
    {
      id: "provider_1",
      name: "Primary Groq",
      provider: "groq",
      enabled: true,
      priority: 10,
      has_key: true,
      key_masked: "stored",
      last_status: "ok",
      last_error: "",
      provider_type: "chat",
    },
    {
      id: "provider_2",
      name: "Fallback Mistral",
      provider: "mistral",
      enabled: true,
      priority: 30,
      has_key: false,
      key_masked: "",
      last_status: "error",
      last_error: "bad raw secret should not leak",
      provider_type: "chat",
    },
  ])

  assert.equal(summary.enabledCount, 2)
  assert.equal(summary.readyCount, 1)
  assert.equal(summary.hasDegradedProviders, true)
  assert.deepEqual(summary.routingOrder.map((item) => item.name), ["Primary Groq", "Fallback Mistral"])
  assert.equal(summary.routingOrder[0].secretLabel, "Stored")
  assert.equal(summary.routingOrder[1].secretLabel, "Missing")
})

test("AI automation prompt library includes provider and Vault operations", () => {
  assert.ok(getPromptTemplate("provider_health_check"))
  assert.ok(getPromptTemplate("daily_spark"))
  assert.ok(getPromptTemplate("graph_edge_suggestion"))
  assert.ok(getPromptTemplate("flashcard_generation"))
  assert.ok(getPromptTemplate("document_formatter"))
  assert.ok(getPromptTemplate("sheet_organizer"))
  assert.ok(getPromptTemplate("slide_builder"))
  assert.ok(getPromptTemplate("practice_generator"))
})

test("AI tutor supports cleanup and mistake modes", () => {
  assert.match(getTutorModeInstruction("cleanup"), /imported material/)
  assert.match(getTutorModeInstruction("mistake"), /misconception/)
})

test("guided prompt builder validates required fields and renders preview", () => {
  const missing = buildGuidedPrompt({
    taskKey: "slide_builder",
    fields: { input: "Photosynthesis notes" },
    filters: {
      sourceScope: "Active Studio item",
      difficulty: "Intermediate",
      tone: "Concise",
      language: "English",
      outputLength: "Balanced",
      providerFamily: "auto",
      insertTarget: "slide-outline",
    },
  })

  assert.equal(missing.ok, false)
  assert.deepEqual(missing.missing, ["Goal"])

  const ready = buildGuidedPrompt({
    taskKey: "slide_builder",
    fields: { input: "Photosynthesis notes", goal: "Teach the process", audience: "Beginners", slideCount: 5 },
    filters: {
      sourceScope: "Active Studio item",
      difficulty: "Beginner",
      tone: "Kind",
      language: "English",
      outputLength: "Balanced",
      providerFamily: "groq",
      insertTarget: "slide-outline",
    },
  })

  assert.equal(ready.ok, true)
  assert.match(ready.preview, /Preferred provider family: groq/)
  assert.match(ready.user, /Insert target: slide-outline/)
})

test("guided prompt contracts expose insert-back actions", () => {
  const practice = promptContracts.find((item) => item.mode === "practice_generator")
  assert.ok(practice)
  assert.deepEqual(listInsertActions(practice.insertTargets).map((item) => item.target), ["quiz", "flashcards", "review-cards"])
})

test("AI insert-back parses JSON fenced responses", () => {
  const parsed = parseAiJson('```json\n{"title":"Deck","slides":[{"title":"One","body":"Body"}]}\n```')

  assert.equal(parsed?.title, "Deck")
  assert.ok(Array.isArray(parsed?.slides))
})

test("AI insert-back maps responses to Studio payloads", () => {
  const sheet = buildInsertBackPayload("sheet-rows", JSON.stringify({
    title: "Tracker",
    columns: ["Topic", "Status"],
    rows: [{ Topic: "React", Status: "Review" }],
  }))
  const slides = buildInsertBackPayload("slide-outline", JSON.stringify({
    title: "Lesson",
    slides: [{ title: "Hook", body: "Why it matters", layout: "quote" }],
  }))
  const doc = buildInsertBackPayload("doc-section", JSON.stringify({
    title: "Guide",
    blocks: [{ type: "heading", text: "Summary" }, { type: "paragraph", text: "Learn it." }],
  }))

  assert.equal(sheet.endpoint, "/api/sheets")
  assert.deepEqual(sheet.body.cells, [["Topic", "Status"], ["React", "Review"]])
  assert.equal(slides.endpoint, "/api/slides")
  assert.equal((slides.body.slides as any[])[0].layout, "quote")
  assert.equal(doc.endpoint, "/api/docs")
  assert.match(String((doc.body.content as any).text), /Summary/)
})

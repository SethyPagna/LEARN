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
})

test("AI tutor supports cleanup and mistake modes", () => {
  assert.match(getTutorModeInstruction("cleanup"), /imported material/)
  assert.match(getTutorModeInstruction("mistake"), /misconception/)
})

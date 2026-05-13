import assert from "node:assert/strict"
import test from "node:test"
import { decryptProviderSecret, encryptProviderSecret, maskProviderSecret, normalizeProviderConfigInput } from "../lib/ai/provider-admin"
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

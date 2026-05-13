import assert from "node:assert/strict"
import test from "node:test"
import { getProviderMetadata, resolveConfiguredProvider } from "../lib/ai/providers"

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

import assert from "node:assert/strict"
import test from "node:test"
import { listConfiguredEnvironmentProviders, resolveConfiguredProvider, resolveLocalOllamaEndpoint } from "../../lib/ai/providers"
import { normalizeProviderConfigInput } from "../../lib/ai/provider-admin"
import { isProviderReady } from "../../lib/ai/gateway-readiness"

test("local Ollama requires explicit loopback server configuration and a model", () => {
  assert.equal(resolveConfiguredProvider({ AI_PROVIDER_DEFAULT: "ollama" }), null)
  assert.equal(resolveConfiguredProvider({ OLLAMA_BASE_URL: "http://127.0.0.1:11434" }), null)
  const provider = resolveConfiguredProvider({ OLLAMA_BASE_URL: "http://127.0.0.1:11434", OLLAMA_MODEL: "installed-model" })!
  assert.equal(provider.provider, "ollama")
  assert.equal(provider.endpoint, "http://127.0.0.1:11434/v1/chat/completions")
  assert.equal(provider.model, "installed-model")
  assert.equal(provider.apiKey, "")
  assert.equal(isProviderReady({ enabled: true, has_key: false, requires_key: false, last_status: "untested" }), true)
})

test("Ollama refuses arbitrary hosts, credentials, paths and query parameters", () => {
  for (const url of ["https://example.com", "http://169.254.169.254", "file:///tmp/ollama", "http://user:secret@localhost:11434", "http://localhost:11434/admin", "http://localhost:11434/?target=remote", "http://localhost:11434/#fragment"]) {
    assert.equal(resolveLocalOllamaEndpoint(url), null, url)
  }
  assert.equal(resolveLocalOllamaEndpoint("http://localhost:11434/v1/"), "http://localhost:11434/v1/chat/completions")
  assert.equal(resolveLocalOllamaEndpoint("http://[::1]:11434"), "http://[::1]:11434/v1/chat/completions")
  assert.throws(() => normalizeProviderConfigInput({ provider: "ollama", endpointOverride: "http://anything" }), /server environment/)
})

test("environment routing includes configured families once and honors the server default", () => {
  const providers = listConfiguredEnvironmentProviders({ AI_PROVIDER_DEFAULT: "ollama", GROQ_API_KEY: "test", OLLAMA_BASE_URL: "http://localhost:11434", OLLAMA_MODEL: "installed-model" })
  assert.deepEqual(providers.map((provider) => provider.provider), ["ollama", "groq"])
})

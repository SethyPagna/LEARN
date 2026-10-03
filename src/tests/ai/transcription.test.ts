/**
 * Voice transcription — the unit half.
 *
 * This capability did not exist before this file. The app advertised voice
 * transcription, the security audit listed it as an existing feature, and a
 * grep for `SpeechRecognition`, Whisper, `/audio/transcriptions` or dictation
 * returned nothing at all. These tests pin the parts that are pure logic:
 * base64 encoding, provider resolution, request shape, and response parsing.
 * The route that wraps them is covered in `tests/api/transcribe-route.test.ts`.
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  TRANSCRIPTION_MODEL,
  buildTranscriptionBody,
  encodeBase64,
  extractTranscriptionText,
  isAudioMimeAllowed,
  isTranscriptionConfigured,
  normalizeAudioMimeType,
  resolveTranscriptionConfig,
} from "../../lib/ai/transcription"

// ---------------------------------------------------------------------------
// base64 — the encoder has to agree with the platform, byte for byte
// ---------------------------------------------------------------------------

test("encodeBase64 matches Node's encoder across every remainder class", () => {
  // 0/1/2 bytes exercise the two padding branches; 3+ exercises the fast path.
  for (const length of [0, 1, 2, 3, 4, 5, 6, 7, 8, 63, 64, 65, 255, 256]) {
    const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 11) % 256)
    assert.equal(
      encodeBase64(bytes),
      Buffer.from(bytes).toString("base64"),
      `mismatch at length ${length}`,
    )
  }
})

test("encodeBase64 handles the byte values that break naive shift arithmetic", () => {
  const bytes = Uint8Array.from([0, 0, 0, 255, 255, 255, 128, 0, 1])
  assert.equal(encodeBase64(bytes), Buffer.from(bytes).toString("base64"))
})

// ---------------------------------------------------------------------------
// content-type handling
// ---------------------------------------------------------------------------

test("normalizeAudioMimeType strips codec parameters and case", () => {
  assert.equal(normalizeAudioMimeType("audio/webm;codecs=opus"), "audio/webm")
  assert.equal(normalizeAudioMimeType("  Audio/MP4  "), "audio/mp4")
  assert.equal(normalizeAudioMimeType(undefined), "")
  assert.equal(normalizeAudioMimeType(null), "")
})

test("every browser recorder container is allowed", () => {
  // Chrome, Safari and Firefox respectively — if any of these regress, the
  // feature silently stops working in one browser.
  assert.ok(isAudioMimeAllowed("audio/webm;codecs=opus"))
  assert.ok(isAudioMimeAllowed("audio/mp4"))
  assert.ok(isAudioMimeAllowed("audio/ogg;codecs=opus"))
})

test("non-audio content types fail closed", () => {
  assert.ok(!isAudioMimeAllowed("application/json"))
  assert.ok(!isAudioMimeAllowed("text/plain"))
  assert.ok(!isAudioMimeAllowed(""))
  assert.ok(!isAudioMimeAllowed(undefined))
  assert.ok(!isAudioMimeAllowed("audio/webm-evil"))
  assert.ok(ALLOWED_AUDIO_MIME_TYPES.length > 0)
})

// ---------------------------------------------------------------------------
// provider resolution
// ---------------------------------------------------------------------------

test("transcription is unconfigured until a Workers AI credential exists", () => {
  assert.equal(resolveTranscriptionConfig({}), null)
  assert.equal(resolveTranscriptionConfig({ CLOUDFLARE_ACCOUNT_ID: "acct" }), null)
  assert.ok(!isTranscriptionConfigured({ CLOUDFLARE_ACCOUNT_ID: "acct" }))
})

test("an account with a token resolves to the Workers AI REST endpoint", () => {
  const config = resolveTranscriptionConfig({
    CLOUDFLARE_ACCOUNT_ID: "acct_123",
    CLOUDFLARE_API_TOKEN: "token_abc",
  })
  assert.ok(config)
  assert.equal(
    config.endpoint,
    `https://api.cloudflare.com/client/v4/accounts/acct_123/ai/run/${TRANSCRIPTION_MODEL}`,
  )
  assert.equal(config.viaGateway, false)
  assert.equal(config.model, TRANSCRIPTION_MODEL)
})

test("a configured gateway is preferred over the account API", () => {
  const config = resolveTranscriptionConfig({
    CLOUDFLARE_ACCOUNT_ID: "acct_123",
    CLOUDFLARE_AI_GATEWAY_ID: "learn-gateway",
    CLOUDFLARE_AI_GATEWAY_TOKEN: "gateway_token",
  })
  assert.ok(config)
  assert.equal(
    config.endpoint,
    `https://gateway.ai.cloudflare.com/v1/acct_123/learn-gateway/workers-ai/${TRANSCRIPTION_MODEL}`,
  )
  assert.equal(config.viaGateway, true)
  assert.equal(config.apiKey, "gateway_token")
})

test("CLOUDFLARE_AI_GATEWAY_URL is deliberately not reused", () => {
  // In ai/providers.ts that variable holds a complete endpoint pointing at a
  // *chat* model. Reusing it here would post audio to a text model, so the
  // resolver must ignore it and require an explicit transcription override.
  const config = resolveTranscriptionConfig({
    CLOUDFLARE_AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/acct/gw/workers-ai/@cf/meta/llama-3.1-8b-instruct",
    CLOUDFLARE_AI_GATEWAY_TOKEN: "gateway_token",
  })
  assert.equal(config, null, "a chat gateway URL must not silently become the audio endpoint")
})

test("an explicit transcription URL wins over everything else", () => {
  const config = resolveTranscriptionConfig({
    CLOUDFLARE_AI_TRANSCRIPTION_URL: "https://example.test/transcribe",
    CLOUDFLARE_ACCOUNT_ID: "acct_123",
    CLOUDFLARE_AI_GATEWAY_ID: "learn-gateway",
    CLOUDFLARE_API_TOKEN: "token_abc",
  })
  assert.ok(config)
  assert.equal(config.endpoint, "https://example.test/transcribe")
  assert.equal(config.viaGateway, true)
})

test("the model id can be overridden for a different deployment", () => {
  const config = resolveTranscriptionConfig({
    CLOUDFLARE_ACCOUNT_ID: "acct_123",
    CLOUDFLARE_API_TOKEN: "token_abc",
    CLOUDFLARE_AI_TRANSCRIPTION_MODEL: "@cf/openai/whisper",
  })
  assert.ok(config)
  assert.equal(config.model, "@cf/openai/whisper")
  assert.ok(config.endpoint.endsWith("@cf/openai/whisper"))
})

// ---------------------------------------------------------------------------
// request shape
// ---------------------------------------------------------------------------

test("the request body carries base64 audio, transcribes, and filters silence", () => {
  const bytes = Uint8Array.from([1, 2, 3, 4, 5])
  const body = buildTranscriptionBody({ bytes })
  assert.equal(body.audio, Buffer.from(bytes).toString("base64"))
  assert.equal(body.task, "transcribe")
  assert.equal(body.vad_filter, true)
  assert.ok(!("language" in body), "language must be omitted so the model auto-detects")
  assert.ok(!("initial_prompt" in body))
})

test("language and prompt are only sent when supplied", () => {
  const bytes = Uint8Array.from([9, 9])
  const body = buildTranscriptionBody({ bytes, language: "zh", prompt: "  lecture notes  " })
  assert.equal(body.language, "zh")
  assert.equal(body.initial_prompt, "lecture notes")
})

test("a long prompt is truncated rather than sent whole", () => {
  const body = buildTranscriptionBody({
    bytes: Uint8Array.from([1]),
    prompt: "x".repeat(2000),
  })
  assert.equal(String(body.initial_prompt).length, 500)
})

// ---------------------------------------------------------------------------
// response parsing — the three shapes the API can actually return
// ---------------------------------------------------------------------------

test("the transcript is read from the REST envelope", () => {
  assert.equal(extractTranscriptionText({ result: { text: " hello world " } }), "hello world")
})

test("the transcript is read from a bare gateway response", () => {
  assert.equal(extractTranscriptionText({ text: "bare response" }), "bare response")
  assert.equal(extractTranscriptionText({ result: "plain string result" }), "plain string result")
  assert.equal(extractTranscriptionText("  a string body  "), "a string body")
})

test("an error payload yields an empty transcript rather than a fabricated one", () => {
  assert.equal(extractTranscriptionText(null), "")
  assert.equal(extractTranscriptionText(undefined), "")
  assert.equal(extractTranscriptionText({ success: false, errors: [{ message: "nope" }] }), "")
  assert.equal(extractTranscriptionText({ result: {} }), "")
})

// ---------------------------------------------------------------------------
// limits
// ---------------------------------------------------------------------------

test("the audio cap is large enough for dictation and small enough for one pass", () => {
  assert.equal(MAX_AUDIO_BYTES, 8 * 1024 * 1024)
})

/**
 * Server-side speech-to-text.
 *
 * This did not exist. The app advertised voice transcription, the security
 * audit assumed it shipped, and an exhaustive grep for `SpeechRecognition`,
 * Whisper, `/audio/transcriptions` or dictation found nothing. This module is
 * the server half of the fix: a real transcription call against Cloudflare
 * Workers AI's Whisper, which is the one provider already configured for this
 * deployment and is priced at $0.000513 per audio minute (well inside the free
 * daily neuron allowance for ordinary dictation).
 *
 * ## Why the request shape is base64 rather than multipart
 *
 * Verified against the model's input schema on 2026-09-21: `audio` accepts
 * either a base64 string or `{ body, contentType }`. Base64 keeps the whole
 * path — route, client, tests — on `fetch` + JSON with no multipart parsing,
 * and it is what Cloudflare's own chunking tutorial uses.
 *
 * ## What is deliberately NOT here
 *
 * No chunking. The tutorial splits long files into 1 MB pieces, which is right
 * for hour-long recordings and wrong for dictation: chunk boundaries cut words
 * in half and the transcripts get concatenated mid-sentence. The size cap below
 * is enforced instead, so the model only ever sees audio short enough to
 * transcribe in one pass.
 */

export const TRANSCRIPTION_MODEL = "@cf/openai/whisper-large-v3-turbo"

/** 8 MB of compressed speech is roughly 8–15 minutes — far past any dictation. */
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024

/** 60 s of transcription at provider latency; matches the house 14–20 s range plus headroom. */
export const TRANSCRIPTION_TIMEOUT_MS = 60_000

/**
 * Containers a browser can realistically hand us. Chrome records `audio/webm`,
 * Safari `audio/mp4`, Firefox `audio/ogg`; the rest are here for uploaded
 * files. The list is an allowlist rather than a blocklist so a novel container
 * fails closed with a clear message instead of being forwarded to the model.
 */
export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "audio/aac",
  "video/webm",
] as const

export interface RuntimeEnv {
  [key: string]: string | undefined
}

export interface TranscriptionConfig {
  endpoint: string
  apiKey: string
  model: string
  /** True when requests are routed through an AI Gateway rather than the account API. */
  viaGateway: boolean
}

export interface TranscriptionResult {
  text: string
  model: string
  wordCount: number
  language: string
  durationSeconds: number
}

function trim(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

/** Normalise `audio/webm;codecs=opus` to `audio/webm`. */
export function normalizeAudioMimeType(value: unknown) {
  return trim(value).split(";")[0]!.trim().toLowerCase()
}

export function isAudioMimeAllowed(value: unknown) {
  const mimeType = normalizeAudioMimeType(value)
  return (ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(mimeType)
}

/**
 * Resolve where to send a transcription request, or `null` when the
 * deployment has no Workers AI credentials.
 *
 * `CLOUDFLARE_AI_GATEWAY_URL` is deliberately NOT consulted. In
 * `ai/providers.ts` that variable holds a *complete* endpoint already pointing
 * at a chat model, so reusing it here would silently post audio to a text
 * model. `CLOUDFLARE_AI_TRANSCRIPTION_URL` is the explicit override instead.
 */
export function resolveTranscriptionConfig(env: RuntimeEnv = process.env as RuntimeEnv): TranscriptionConfig | null {
  const apiKey = trim(env.CLOUDFLARE_AI_GATEWAY_TOKEN) || trim(env.CLOUDFLARE_API_TOKEN)
  if (!apiKey) return null

  const model = trim(env.CLOUDFLARE_AI_TRANSCRIPTION_MODEL) || TRANSCRIPTION_MODEL
  const explicit = trim(env.CLOUDFLARE_AI_TRANSCRIPTION_URL)
  if (explicit) return { endpoint: explicit, apiKey, model, viaGateway: true }

  const accountId = trim(env.CLOUDFLARE_ACCOUNT_ID)
  const gatewayId = trim(env.CLOUDFLARE_AI_GATEWAY_ID)
  if (accountId && gatewayId) {
    return {
      endpoint: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/workers-ai/${model}`,
      apiKey,
      model,
      viaGateway: true,
    }
  }

  if (accountId) {
    return {
      endpoint: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      apiKey,
      model,
      viaGateway: false,
    }
  }

  return null
}

export function isTranscriptionConfigured(env: RuntimeEnv = process.env as RuntimeEnv) {
  return resolveTranscriptionConfig(env) !== null
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/**
 * Base64-encode bytes without `btoa` or `Buffer`.
 *
 * Both exist somewhere in the supported runtimes but not in the same one —
 * `btoa` needs a binary string built from the whole array first, and `Buffer`
 * needs `nodejs_compat`. A 3-byte-group encoder works identically in Node,
 * workerd, and the test runner, and is directly unit-testable.
 */
export function encodeBase64(bytes: Uint8Array): string {
  let output = ""
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!
    const second = index + 1 < bytes.length ? bytes[index + 1] : undefined
    const third = index + 2 < bytes.length ? bytes[index + 2] : undefined

    output += BASE64_ALPHABET[first >> 2]
    output += BASE64_ALPHABET[((first & 0b11) << 4) | ((second ?? 0) >> 4)]
    output += second === undefined ? "=" : BASE64_ALPHABET[((second & 0b1111) << 2) | ((third ?? 0) >> 6)]
    output += third === undefined ? "=" : BASE64_ALPHABET[third & 0b111111]
  }
  return output
}

/** Build the model's request body. Exported so tests can assert on it directly. */
export function buildTranscriptionBody(input: {
  bytes: Uint8Array
  language?: string
  prompt?: string
}) {
  const body: Record<string, unknown> = {
    audio: encodeBase64(input.bytes),
    task: "transcribe",
    // Drops silent stretches before decoding, which is what stops Whisper
    // hallucinating filler sentences out of background noise.
    vad_filter: true,
  }
  const language = trim(input.language)
  if (language) body.language = language
  const prompt = trim(input.prompt)
  if (prompt) body.initial_prompt = prompt.slice(0, 500)
  return body
}

/**
 * Pull the transcript out of a Workers AI response.
 *
 * The REST API wraps the model output in `{ result }`; the AI Gateway returns
 * the model output directly; an error response has no `result` at all. All
 * three shapes are handled so a gateway misconfiguration surfaces as a thrown
 * message rather than an empty transcript.
 */
export function extractTranscriptionText(payload: unknown): string {
  if (typeof payload === "string") return payload.trim()
  if (!payload || typeof payload !== "object") return ""
  const record = payload as Record<string, unknown>
  const result = record.result
  if (typeof result === "string") return result.trim()
  if (result && typeof result === "object") {
    const nested = result as Record<string, unknown>
    if (typeof nested.text === "string") return nested.text.trim()
    if (typeof nested.response === "string") return nested.response.trim()
  }
  if (typeof record.text === "string") return record.text.trim()
  if (typeof record.response === "string") return record.response.trim()
  return ""
}

function describeProviderError(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    const errors = record.errors
    if (Array.isArray(errors) && errors.length) {
      const messages = errors
        .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>).message : entry))
        .filter((message): message is string => typeof message === "string" && Boolean(message.trim()))
      if (messages.length) return messages.join("; ")
    }
    if (typeof record.error === "string" && record.error.trim()) return record.error
    if (typeof record.message === "string" && record.message.trim()) return record.message
  }
  return `Transcription provider returned ${status}.`
}

export interface TranscribeAudioInput {
  bytes: Uint8Array
  language?: string
  prompt?: string
  env?: RuntimeEnv
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscriptionResult> {
  const env = input.env ?? (process.env as RuntimeEnv)
  const config = resolveTranscriptionConfig(env)
  if (!config) {
    throw new Error(
      "Voice transcription is not configured. Set CLOUDFLARE_ACCOUNT_ID and " +
        "CLOUDFLARE_AI_GATEWAY_TOKEN (or CLOUDFLARE_API_TOKEN) to enable it.",
    )
  }
  if (!input.bytes.length) throw new Error("No audio was received.")

  const fetchImpl = input.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS)

  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(
        buildTranscriptionBody({
          bytes: input.bytes,
          language: input.language,
          prompt: input.prompt,
        }),
      ),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(describeProviderError(payload, response.status))

    const text = extractTranscriptionText(payload)
    if (!text) throw new Error("The transcription provider returned an empty transcript.")

    const record = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>
    const result = (record.result && typeof record.result === "object" ? record.result : record) as Record<string, unknown>
    const info = (result.transcription_info && typeof result.transcription_info === "object"
      ? result.transcription_info
      : {}) as Record<string, unknown>

    return {
      text,
      model: config.model,
      wordCount: Number.isFinite(Number(result.word_count)) ? Number(result.word_count) : text.split(/\s+/).filter(Boolean).length,
      language: typeof info.language === "string" ? info.language : "",
      durationSeconds: Number.isFinite(Number(info.duration)) ? Number(info.duration) : 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}

import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import {
  MAX_AUDIO_BYTES,
  isAudioMimeAllowed,
  isTranscriptionConfigured,
  normalizeAudioMimeType,
  transcribeAudio,
} from "@/lib/ai/transcription"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

const MAX_AUDIO_MEGABYTES = Math.round(MAX_AUDIO_BYTES / (1024 * 1024))

/**
 * Speech to text.
 *
 * The body is raw audio, not JSON — so this route deliberately does not use
 * `readJsonObject`. Everything cheap and rejectable (method, session, config,
 * content type, declared size) is checked before a single byte is buffered.
 */
export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  if (!isTranscriptionConfigured()) {
    return fail(
      "Voice transcription is not configured on this deployment. " +
        "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_GATEWAY_TOKEN (or CLOUDFLARE_API_TOKEN).",
      503,
    )
  }

  const declaredType = request.headers.get("content-type")
  if (!isAudioMimeAllowed(declaredType)) {
    const received = normalizeAudioMimeType(declaredType) || "no content-type"
    return fail(
      `Unsupported audio format (${received}). Send audio/webm, audio/ogg, audio/mp4, audio/mpeg or audio/wav.`,
      415,
    )
  }

  // Reject on the declared length first so an oversized upload is refused
  // before it is read into memory. The actual length is re-checked below,
  // because a client can lie about or omit Content-Length.
  const declaredLength = Number(request.headers.get("content-length") || 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES) {
    return fail(`Recording is too large. Keep it under ${MAX_AUDIO_MEGABYTES} MB.`, 413)
  }

  const limit = await checkRateLimit({
    key: `transcribe:${user.id}:${getClientIp(request.headers)}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  })
  if (!limit.allowed) return fail("Too many transcription requests. Try again later.", 429)

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (!bytes.byteLength) return fail("No audio was received.", 400)
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return fail(`Recording is too large. Keep it under ${MAX_AUDIO_MEGABYTES} MB.`, 413)
  }

  const params = new URL(request.url).searchParams
  try {
    const result = await transcribeAudio({
      bytes,
      language: params.get("language") || undefined,
      prompt: params.get("prompt") || undefined,
    })
    return ok(result)
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Transcription failed.", 502)
  }
})

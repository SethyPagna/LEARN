/**
 * The transcription route.
 *
 * This is the first handler test written against the harness introduced in
 * `tests/api/harness.ts`, and it exists because voice transcription was the
 * one capability the product advertised twice and did not have. Everything
 * cheap and rejectable is asserted first — session, config, content type, size
 * — because those are the checks that stop the route being an open proxy to a
 * paid model.
 */

import assert from "node:assert/strict"
import test from "node:test"

import { installDatabaseStub, primeDatabase, readJson, request, stubSessionLookup } from "./harness"

const AUDIO_BYTES = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x11, 0x22, 0x33])

function withEnv<T>(overrides: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const keys = Object.keys(overrides)
  const saved = new Map(keys.map((key) => [key, process.env[key]]))
  for (const key of keys) {
    const next = overrides[key]
    if (next === undefined) delete process.env[key]
    else process.env[key] = next
  }
  return run().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
}

async function loadRoute() {
  return import("../../app/api/ai/transcribe/route")
}

function stubProvider(stub: ReturnType<typeof installDatabaseStub>, payload: unknown, status = 200) {
  stub.onHttp(/\/ai\/run\/|gateway\.ai\.cloudflare\.com/, () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    }),
  )
}

test("an unauthenticated request never reaches the provider", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubProvider(stub, { result: { text: "should not happen" } })

    const { POST } = await loadRoute()
    const response = await POST(
      request("/api/ai/transcribe", {
        method: "POST",
        rawBody: AUDIO_BYTES,
        contentType: "audio/webm",
        token: null,
      }),
    )

    assert.equal(response.status, 401)
    assert.equal(stub.httpRequests.length, 0, "no provider call may happen without a session")
  } finally {
    stub.restore()
  }
})

test("a cross-origin upload is rejected before the body is read", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubProvider(stub, { result: { text: "should not happen" } })

    const { POST } = await loadRoute()
    const response = await POST(
      request("/api/ai/transcribe", {
        method: "POST",
        rawBody: AUDIO_BYTES,
        contentType: "audio/webm",
        headers: { origin: "https://attacker.example" },
      }),
    )

    assert.equal(response.status, 403)
    assert.equal(stub.httpRequests.length, 0)
  } finally {
    stub.restore()
  }
})

test("a deployment with no Workers AI credential fails closed with a 503", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)

    await withEnv(
      {
        CLOUDFLARE_ACCOUNT_ID: undefined,
        CLOUDFLARE_API_TOKEN: undefined,
        CLOUDFLARE_AI_GATEWAY_TOKEN: undefined,
      },
      async () => {
        const { POST } = await loadRoute()
        const response = await POST(
          request("/api/ai/transcribe", { method: "POST", rawBody: AUDIO_BYTES, contentType: "audio/webm" }),
        )

        assert.equal(response.status, 503)
        const body = await readJson<{ error: string }>(response)
        assert.match(body.error, /not configured/i)
        assert.equal(stub.httpRequests.length, 0)
      },
    )
  } finally {
    stub.restore()
  }
})

test("a non-audio content type is rejected with 415", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)

    const { POST } = await loadRoute()
    const response = await POST(
      request("/api/ai/transcribe", {
        method: "POST",
        rawBody: JSON.stringify({ sneaky: true }),
        contentType: "application/json",
      }),
    )

    assert.equal(response.status, 415)
    const body = await readJson<{ error: string }>(response)
    assert.match(body.error, /unsupported audio format/i)
    assert.equal(stub.httpRequests.length, 0)
  } finally {
    stub.restore()
  }
})

test("an oversized upload is refused on the declared length alone", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)

    const { POST } = await loadRoute()
    const response = await POST(
      request("/api/ai/transcribe", {
        method: "POST",
        rawBody: AUDIO_BYTES,
        contentType: "audio/webm",
        headers: { "content-length": String(64 * 1024 * 1024) },
      }),
    )

    assert.equal(response.status, 413)
    const body = await readJson<{ error: string }>(response)
    assert.match(body.error, /too large/i)
    assert.equal(stub.httpRequests.length, 0, "an oversized upload must not be forwarded")
  } finally {
    stub.restore()
  }
})

test("an empty recording is rejected with 400", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)

    const { POST } = await loadRoute()
    const response = await POST(
      request("/api/ai/transcribe", {
        method: "POST",
        rawBody: new Uint8Array(0),
        contentType: "audio/webm",
      }),
    )

    assert.equal(response.status, 400)
    assert.equal(stub.httpRequests.length, 0)
  } finally {
    stub.restore()
  }
})

test("a recording is transcribed through Workers AI and the text comes back", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubProvider(stub, {
      result: {
        text: "  Round-robin scheduling is best for fairness.  ",
        word_count: 7,
        transcription_info: { language: "en", duration: 3.5 },
      },
      success: true,
      errors: [],
    })

    const { POST } = await loadRoute()
    const response = await POST(
      request("/api/ai/transcribe?language=en", {
        method: "POST",
        rawBody: AUDIO_BYTES,
        contentType: "audio/webm;codecs=opus",
      }),
    )

    const body = await readJson<{
      text: string
      model: string
      wordCount: number
      language: string
      durationSeconds: number
      error?: string
    }>(response)

    assert.equal(response.status, 200, `unexpected failure: ${body.error ?? "no error body"}`)
    assert.equal(body.text, "Round-robin scheduling is best for fairness.")
    assert.equal(body.wordCount, 7)
    assert.equal(body.language, "en")
    assert.equal(body.durationSeconds, 3.5)

    // Exactly one provider call, to the Workers AI account endpoint, carrying
    // the credential as a bearer token and the audio as base64.
    assert.equal(stub.httpRequests.length, 1)
    const [outbound] = stub.httpRequests
    assert.match(outbound.url, /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/.+\/ai\/run\//)
    assert.match(outbound.url, /whisper-large-v3-turbo/)

    const headers = new Headers(outbound.init?.headers)
    assert.match(String(headers.get("authorization")), /^Bearer .+/)

    const sent = JSON.parse(String(outbound.init?.body)) as Record<string, unknown>
    assert.equal(sent.audio, Buffer.from(AUDIO_BYTES).toString("base64"))
    assert.equal(sent.task, "transcribe")
    assert.equal(sent.language, "en")
    assert.equal(sent.vad_filter, true)
  } finally {
    stub.restore()
  }
})

test("a provider failure surfaces the provider's own message as a 502", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubProvider(
      stub,
      { success: false, errors: [{ message: "Audio could not be decoded." }] },
      400,
    )

    const { POST } = await loadRoute()
    const response = await POST(
      request("/api/ai/transcribe", {
        method: "POST",
        rawBody: AUDIO_BYTES,
        contentType: "audio/webm",
      }),
    )

    assert.equal(response.status, 502)
    const body = await readJson<{ error: string }>(response)
    assert.match(body.error, /could not be decoded/i)
  } finally {
    stub.restore()
  }
})

test("an empty transcript is reported as an error rather than a silent success", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubProvider(stub, { result: { text: "   " }, success: true, errors: [] })

    const { POST } = await loadRoute()
    const response = await POST(
      request("/api/ai/transcribe", {
        method: "POST",
        rawBody: AUDIO_BYTES,
        contentType: "audio/webm",
      }),
    )

    assert.equal(response.status, 502)
    const body = await readJson<{ error: string }>(response)
    assert.match(body.error, /empty transcript/i)
  } finally {
    stub.restore()
  }
})

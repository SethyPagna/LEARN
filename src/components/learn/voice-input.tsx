"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Mic, Square, TriangleAlert } from "lucide-react"

/**
 * Dictation control.
 *
 * Voice transcription was requested twice and did not exist. The server half is
 * `lib/ai/transcription.ts` plus `POST /api/ai/transcribe`; this is the client
 * half, and it is the piece that makes the feature reachable from an editor.
 *
 * ## Why MediaRecorder and not the Web Speech API
 *
 * `webkitSpeechRecognition` gives live interim text and costs nothing, which is
 * tempting. It is rejected here for three reasons: it does not exist in
 * Firefox, it ships the user's microphone audio to Google or Apple with no
 * disclosure, and it is unavailable in installed PWAs on several platforms. A
 * record-then-transcribe flow behaves identically everywhere, keeps the audio
 * on infrastructure this app already pays for, and produces a transcript the
 * user can review before it lands in their notes.
 */

/** Stop automatically well before the 8 MB server cap can be reached. */
const MAX_RECORDING_MS = 5 * 60 * 1000

/**
 * Ordered by preference. Opus in WebM is the best size/quality trade-off and is
 * what Chrome and Edge produce; `audio/mp4` covers Safari, `audio/ogg` Firefox.
 */
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
]

type Phase = "unsupported" | "idle" | "requesting" | "recording" | "transcribing"

export interface VoiceInputProps {
  /** Called with the final transcript. Never called with an empty string. */
  onTranscript: (text: string, meta: { durationSeconds: number; language: string }) => void
  /** BCP-47 or ISO-639-1 hint. Omitted means the model auto-detects. */
  language?: string
  /** Extra context for the model — topic names, terminology, a note title. */
  prompt?: string
  disabled?: boolean
  className?: string
  label?: string
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return ""
  for (const candidate of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return ""
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export function VoiceInput({
  onTranscript,
  language,
  prompt,
  disabled,
  className = "",
  label = "Dictate",
}: VoiceInputProps) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState("")
  const [elapsedMs, setElapsedMs] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  useEffect(() => {
    mountedRef.current = true
    // Only reachable in a real browser, so this cannot run during SSR.
    const supported =
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined" &&
      pickMimeType() !== ""
    if (!supported) setPhase("unsupported")

    return () => {
      mountedRef.current = false
      stopTimer()
      abortRef.current?.abort()
      // Stopping the recorder fires onstop, which would try to upload; the
      // recorder is detached first so that path is skipped on unmount.
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null
        recorderRef.current.stop()
      }
      releaseStream()
    }
  }, [releaseStream, stopTimer])

  const upload = useCallback(
    async (blob: Blob, durationSeconds: number) => {
      setPhase("transcribing")
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const params = new URLSearchParams()
        if (language) params.set("language", language)
        if (prompt) params.set("prompt", prompt)
        const query = params.toString()

        const response = await fetch(`/api/ai/transcribe${query ? `?${query}` : ""}`, {
          method: "POST",
          headers: { "content-type": blob.type || "audio/webm" },
          body: blob,
          signal: controller.signal,
        })
        const payload = (await response.json().catch(() => ({}))) as {
          text?: string
          language?: string
          error?: string
        }
        if (!response.ok) throw new Error(payload.error || `Transcription failed (${response.status}).`)

        const text = String(payload.text || "").trim()
        if (!text) throw new Error("No speech was detected in that recording.")

        if (!mountedRef.current) return
        setPhase("idle")
        setElapsedMs(0)
        onTranscript(text, { durationSeconds, language: String(payload.language || language || "") })
      } catch (caught) {
        if (!mountedRef.current) return
        if (caught instanceof DOMException && caught.name === "AbortError") {
          setPhase("idle")
          return
        }
        setPhase("idle")
        setError(caught instanceof Error ? caught.message : "Transcription failed.")
      } finally {
        abortRef.current = null
      }
    },
    [language, onTranscript, prompt],
  )

  const stop = useCallback(() => {
    stopTimer()
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
  }, [stopTimer])

  const start = useCallback(async () => {
    setError("")
    setPhase("requesting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream

      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        stopTimer()
        releaseStream()
        const durationSeconds = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" })
        chunksRef.current = []
        recorderRef.current = null
        if (!blob.size) {
          setPhase("idle")
          setError("That recording was empty.")
          return
        }
        void upload(blob, durationSeconds)
      }

      recorder.start()
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
      setElapsedMs(0)
      setPhase("recording")
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current
        setElapsedMs(elapsed)
        if (elapsed >= MAX_RECORDING_MS) stop()
      }, 250)
    } catch (caught) {
      releaseStream()
      setPhase("idle")
      const name = caught instanceof DOMException ? caught.name : ""
      setError(
        name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser settings and try again."
          : name === "NotFoundError"
            ? "No microphone was found on this device."
            : caught instanceof Error
              ? caught.message
              : "Could not start recording.",
      )
    }
  }, [releaseStream, stop, stopTimer, upload])

  if (phase === "unsupported") {
    return (
      <p className={`text-xs text-muted-foreground ${className}`}>
        Dictation needs a browser with microphone recording support (Chrome, Edge, Safari, or Firefox).
      </p>
    )
  }

  const busy = phase === "requesting" || phase === "transcribing"
  const recording = phase === "recording"

  return (
    <div className={`grid gap-1 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => (recording ? stop() : void start())}
          aria-pressed={recording}
          aria-label={recording ? "Stop recording" : busy ? "Transcribing" : label}
          title={recording ? "Stop recording" : label}
          className={`flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors disabled:opacity-60 ${
            recording
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
          }`}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : recording ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Mic className="h-3.5 w-3.5" />
          )}
          {recording ? `Stop (${formatElapsed(elapsedMs)})` : phase === "transcribing" ? "Transcribing…" : phase === "requesting" ? "Starting…" : null}
        </button>

        {recording ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive" aria-hidden="true">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
            Recording
          </span>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {recording ? "Recording in progress." : phase === "transcribing" ? "Transcribing recording." : ""}
      </p>

      {error ? (
        <p className="flex items-start gap-1.5 text-xs font-semibold text-destructive">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  )
}

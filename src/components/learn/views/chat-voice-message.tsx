"use client"

import { useEffect, useRef, useState } from "react"
import { MAX_SOCIAL_MEDIA_BYTES, MAX_VOICE_SECONDS } from "@/lib/social-media"

export function ChatVoiceMessage({ onSend, disabled }: { onSend: (file: File) => Promise<boolean>; disabled?: boolean }) {
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [status, setStatus] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState("")
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const discardRef = useRef(false)

  function stop(discard = false) {
    discardRef.current = discard
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    if (mountedRef.current) setRecording(false)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; stop(true) }
  }, [])

  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : ""
    setPreviewUrl(url)
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [file])

  async function start() {
    if (busy || recording || disabled) return
    setBusy(true)
    setStatus("")
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Voice recording is unavailable in this browser. You can attach an audio file instead.")
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return }
      streamRef.current = stream
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      discardRef.current = false
      const chunks: Blob[] = []
      let size = 0
      recorder.ondataavailable = (event) => {
        size += event.data.size
        if (size > MAX_SOCIAL_MEDIA_BYTES) {
          stop(true)
          if (mountedRef.current) setStatus("Recording exceeded 20 MB. Please record a shorter message.")
        } else if (event.data.size) chunks.push(event.data)
      }
      recorder.onerror = () => { stop(true); if (mountedRef.current) setStatus("Recording failed. Please try again.") }
      recorder.onstop = () => {
        recorderRef.current = null
        if (!mountedRef.current || discardRef.current || !chunks.length) return
        const type = recorder.mimeType || mimeType || "audio/webm"
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"
        setFile(new File(chunks, `voice-message-${Date.now()}.${extension}`, { type }))
        setStatus("Listen before sending.")
      }
      setFile(null)
      setSeconds(0)
      setRecording(true)
      recorder.start(500)
      const startedAt = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        setSeconds(elapsed)
        if (elapsed >= MAX_VOICE_SECONDS) stop()
      }, 250)
    } catch (error) {
      stop(true)
      if (mountedRef.current) setStatus(error instanceof Error ? error.message : "Could not access the microphone.")
    } finally { if (mountedRef.current) setBusy(false) }
  }

  async function send() {
    if (!file || busy) return
    setBusy(true)
    try { if (await onSend(file)) { setFile(null); setStatus("Voice message sent.") } }
    finally { if (mountedRef.current) setBusy(false) }
  }

  return <div className="rounded-xl border border-border bg-background p-3 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      {recording ? <>
        <span role="status">Recording {seconds}s / {MAX_VOICE_SECONDS}s</span>
        <button type="button" className="rounded-md border px-3 py-1" onClick={() => stop()}>Stop and listen</button>
        <button type="button" onClick={() => stop(true)}>Cancel recording</button>
      </> : <button type="button" className="rounded-md border px-3 py-1" disabled={busy || disabled} onClick={start}>{busy ? "Please wait…" : "Record voice message"}</button>}
      {file && previewUrl ? <>
        <audio controls preload="metadata" src={previewUrl} aria-label="Voice message preview" className="max-w-full" />
        <button type="button" className="rounded-md bg-primary px-3 py-1 text-primary-foreground" disabled={busy || disabled} onClick={send}>Send voice message</button>
        <button type="button" disabled={busy} onClick={() => setFile(null)}>Discard</button>
      </> : null}
    </div>
    {status ? <p role="status" className="mt-1 text-xs text-muted-foreground">{status}</p> : null}
  </div>
}

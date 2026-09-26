"use client"

import { useEffect, useState } from "react"
import { CHAT_STICKERS, MAX_SOCIAL_MEDIA_BYTES } from "@/lib/social-media"

function canvasFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(new File([blob], filename, { type: "image/png" })) : reject(new Error("Could not create that picture.")), "image/png"))
}

export function ChatMediaComposer({ onSend, onEmoji }: { onSend: (file: File) => Promise<boolean>; onEmoji: (emoji: string) => void }) {
  const [background, setBackground] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState("")
  const [top, setTop] = useState("")
  const [bottom, setBottom] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  useEffect(() => {
    const url = background ? URL.createObjectURL(background) : ""
    setImageUrl(url)
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [background])

  async function sendPicture(make: () => Promise<File>) {
    if (busy) return
    setBusy(true)
    setStatus("")
    try { if (await onSend(await make())) setStatus("Picture sent.") }
    catch (error) { setStatus(error instanceof Error ? error.message : "Could not send picture.") }
    finally { setBusy(false) }
  }

  async function sticker(glyph: string) {
    const canvas = document.createElement("canvas")
    canvas.width = 256; canvas.height = 256
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Your browser could not create a sticker.")
    ctx.font = '180px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'
    ctx.textAlign = "center"; ctx.textBaseline = "middle"
    ctx.fillText(glyph, 128, 135)
    return canvasFile(canvas, "study-sticker.png")
  }

  async function meme() {
    if (!imageUrl) throw new Error("Choose a picture first.")
    const image = new Image()
    image.src = imageUrl
    await image.decode()
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Your browser could not create a meme.")
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.lineJoin = "round"
    for (const [text, lower] of [[top, false], [bottom, true]] as const) {
      let size = Math.max(18, Math.round(canvas.width / 12))
      ctx.font = `900 ${size}px sans-serif`
      while (size > 10 && ctx.measureText(text).width > canvas.width - 24) { size--; ctx.font = `900 ${size}px sans-serif` }
      const y = lower ? canvas.height - size - 16 : 12
      ctx.lineWidth = Math.max(2, size / 12); ctx.strokeStyle = "black"; ctx.fillStyle = "white"
      ctx.strokeText(text, canvas.width / 2, y); ctx.fillText(text, canvas.width / 2, y)
    }
    return canvasFile(canvas, "study-meme.png")
  }

  return <details className="rounded-xl border border-border bg-background p-3 text-sm">
    <summary className="cursor-pointer font-semibold">Emoji, stickers, GIFs and memes</summary>
    <fieldset disabled={busy} className="mt-3 grid gap-3">
      <div><h4 className="mb-1 text-xs text-muted-foreground">Emoji</h4>
        <div className="flex flex-wrap gap-2">{CHAT_STICKERS.map((glyph) => <button type="button" key={glyph} aria-label={`Add ${glyph} emoji`} className="rounded border px-2 py-1 text-xl" onClick={() => onEmoji(glyph)}>{glyph}</button>)}</div>
      </div>
      <div><h4 className="mb-1 text-xs text-muted-foreground">Stickers</h4>
        <div className="flex flex-wrap gap-2">{CHAT_STICKERS.map((glyph) => <button type="button" key={glyph} aria-label={`Send ${glyph} sticker`} className="rounded border px-2 py-1 text-2xl" onClick={() => sendPicture(() => sticker(glyph))}>{glyph}</button>)}</div>
      </div>
      <label className="grid gap-1">Send a GIF from your device
        <input type="file" accept="image/gif" onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = ""
          if (!file) return
          if (file.type !== "image/gif" || file.size > MAX_SOCIAL_MEDIA_BYTES) { setStatus("Choose a GIF under 20 MB."); return }
          void sendPicture(async () => file)
        }} />
      </label>
      <label className="grid gap-1">Make a meme: choose a picture
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = ""
          if (!file) return
          if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > MAX_SOCIAL_MEDIA_BYTES) { setStatus("Choose a PNG, JPEG or WebP picture under 20 MB."); return }
          setBackground(file)
        }} />
      </label>
      {imageUrl ? <div className="relative mx-auto max-w-xs overflow-hidden rounded-lg">
        <img loading="lazy" decoding="async" src={imageUrl} alt="Meme background preview" className="max-h-56 w-full object-contain" />
        <p className="absolute inset-x-2 top-2 text-center text-lg font-black text-white [text-shadow:1px_1px_2px_black]">{top}</p>
        <p className="absolute inset-x-2 bottom-2 text-center text-lg font-black text-white [text-shadow:1px_1px_2px_black]">{bottom}</p>
      </div> : null}
      <input aria-label="Meme top caption" placeholder="Top caption" maxLength={80} value={top} onChange={(event) => setTop(event.target.value)} className="rounded border bg-background px-3 py-2" />
      <input aria-label="Meme bottom caption" placeholder="Bottom caption" maxLength={80} value={bottom} onChange={(event) => setBottom(event.target.value)} className="rounded border bg-background px-3 py-2" />
      <button type="button" disabled={!background || (!top.trim() && !bottom.trim())} className="justify-self-start rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" onClick={() => sendPicture(meme)}>Send meme</button>
    </fieldset>
    {status || busy ? <p role="status" className="mt-2 text-xs">{busy ? "Sending picture…" : status}</p> : null}
  </details>
}

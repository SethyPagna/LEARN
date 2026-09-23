"use client"

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { CloudUpload, LoaderCircle, RefreshCw } from "lucide-react"

import { pictureElement } from "@/lib/design/editing"

import { setDesignDragItem } from "../design-drag"
import type { DesignEditorApi, UploadedPicture } from "../editor-types"
import { dragHasFiles, listPictures, pictureFilesFrom } from "../image-upload"
import { EmptyHint, PanelHeading } from "./panel-kit"

/**
 * The person's pictures: upload new ones (button, drop, or paste anywhere in
 * the editor), and click or drag any of them onto a page. Dropping a picture on
 * a frame or another picture fills it instead.
 */

function PictureTile({ picture, onPick }: { picture: UploadedPicture; onPick: (picture: UploadedPicture, natural: { width: number; height: number } | null) => void }) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [failed, setFailed] = useState(false)
  const natural = () => {
    const image = imageRef.current
    if (image && image.naturalWidth > 0) return { width: image.naturalWidth, height: image.naturalHeight }
    return picture.width && picture.height ? { width: picture.width, height: picture.height } : null
  }
  const onDragStart = (event: DragEvent<HTMLButtonElement>) => {
    const size = natural()
    setDesignDragItem(event.dataTransfer, { kind: "picture", src: picture.src, width: size?.width ?? null, height: size?.height ?? null })
    if (imageRef.current) event.dataTransfer.setDragImage(imageRef.current, imageRef.current.width / 2, imageRef.current.height / 2)
  }
  if (failed) return null
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={() => onPick(picture, natural())}
      className="group relative aspect-square overflow-hidden rounded-xl bg-muted transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-16px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`${picture.name} (click to add, or drag onto a page or frame)`}
      aria-label={`Add picture ${picture.name}`}
    >
      <img ref={imageRef} src={picture.src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-cover transition group-hover:scale-105" />
    </button>
  )
}

export function UploadsPanel({ api }: { api: DesignEditorApi }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [library, setLibrary] = useState<UploadedPicture[] | null>(null)
  const [loadError, setLoadError] = useState("")
  const [busy, setBusy] = useState(0)
  const [dragging, setDragging] = useState(false)

  const load = () => {
    setLoadError("")
    listPictures()
      .then(setLibrary)
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Your pictures could not be loaded."))
  }
  useEffect(load, [])

  const pictures = useMemo(() => {
    const seen = new Set<string>()
    const all: UploadedPicture[] = []
    for (const picture of [...api.recentUploads, ...(library ?? [])]) {
      if (seen.has(picture.id)) continue
      seen.add(picture.id)
      all.push(picture)
    }
    return all
  }, [api.recentUploads, library])

  const upload = async (files: File[]) => {
    if (!files.length) return
    setBusy((count) => count + files.length)
    try {
      await api.uploadFiles(files)
    } finally {
      setBusy((count) => Math.max(0, count - files.length))
    }
  }

  const place = (picture: UploadedPicture, natural: { width: number; height: number } | null) => {
    api.insertElements([pictureElement(picture.src, natural, { width: api.design.width, height: api.design.height })])
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        aria-label="Upload pictures"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ""
          void upload(files)
        }}
      />
      <div
        onDragOver={(event) => {
          if (!dragHasFiles(event.dataTransfer)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = "copy"
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (!dragHasFiles(event.dataTransfer)) return
          event.preventDefault()
          event.stopPropagation()
          setDragging(false)
          void upload(pictureFilesFrom(event.dataTransfer))
        }}
        className={`mb-4 rounded-2xl border-2 border-dashed p-4 text-center transition ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_12px_24px_-16px_var(--primary)] transition hover:brightness-110"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CloudUpload className="h-4 w-4" aria-hidden="true" />}
          {busy ? `Uploading ${busy}…` : "Upload pictures"}
        </button>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Or drop them here or on a page, or paste with Ctrl+V. Big photos are shrunk to 2400px before upload.</p>
      </div>

      <PanelHeading
        action={
          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" onClick={load} aria-label="Reload your pictures" title="Reload">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        }
      >
        Your pictures
      </PanelHeading>
      {loadError ? <EmptyHint>{loadError}</EmptyHint> : null}
      {!loadError && library === null && !pictures.length ? (
        <div className="grid grid-cols-3 gap-2" aria-busy="true" aria-label="Loading your pictures">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="aspect-square animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : null}
      {library !== null && !pictures.length && !loadError ? <EmptyHint>No pictures yet. Upload one to put it on a page.</EmptyHint> : null}
      {pictures.length ? (
        <div className="grid grid-cols-3 gap-2">
          {pictures.map((picture) => (
            <PictureTile key={picture.id} picture={picture} onPick={place} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

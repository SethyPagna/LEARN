"use client"

import { useEffect, useRef, useState } from "react"
import { Download, Upload } from "lucide-react"
import type { MediaFile } from "../types"
import { api, formatBytes, formatDate } from "../api"
import { EmptyState, Panel } from "../ui"

export function FilesView() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [status, setStatus] = useState("Loading files...")

  async function refresh() {
    try {
      const response = await api<{ files: MediaFile[] }>("/api/files")
      setFiles(response.files)
      setStatus("")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load files.")
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function upload(file?: File) {
    if (!file) return
    setStatus("Uploading file...")
    const form = new FormData()
    form.set("file", file)
    await api("/api/files", { method: "POST", body: form })
    await refresh()
  }

  return (
    <Panel className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Files</h2>
          <p className="mt-1 text-sm text-muted-foreground">Uploads are stored in the isolated learn-files R2 bucket.</p>
        </div>
        <button onClick={() => inputRef.current?.click()} className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <Upload className="h-4 w-4" />
          Upload
        </button>
        <input ref={inputRef} type="file" className="hidden" onChange={(event) => upload(event.target.files?.[0])} />
      </div>
      {status ? <p className="mb-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">{status}</p> : null}
      {files.length ? (
        <div className="overflow-hidden rounded-lg border border-border">
          {files.map((file) => (
            <div key={file.id} className="grid gap-3 border-b border-border p-3 text-sm last:border-b-0 md:grid-cols-[1fr_130px_110px_90px] md:items-center">
              <div>
                <p className="font-medium text-foreground">{file.filename}</p>
                <p className="text-xs text-muted-foreground">{file.content_type}</p>
              </div>
              <p className="text-muted-foreground">{formatBytes(file.size_bytes)}</p>
              <p className="text-muted-foreground">{formatDate(file.created_at)}</p>
              <a href={`/api/files/${file.id}/download`} className="flex h-9 items-center justify-center gap-2 rounded-md border border-border text-foreground">
                <Download className="h-4 w-4" />
                Get
              </a>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No files yet" body="Upload PDFs, images, and study materials to attach durable context to the workspace." />
      )}
    </Panel>
  )
}

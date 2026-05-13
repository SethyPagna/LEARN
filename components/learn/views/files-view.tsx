"use client"

import { useEffect, useRef, useState } from "react"
import { Copy, Download, ImageIcon, Trash2, Upload, Video } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { MediaFile } from "../types"
import { api, formatBytes, formatDate } from "../api"
import { EmptyState, Panel } from "../ui"

export function FilesView({ options }: { options: WorkspaceOptions }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("Loading files...")
  const filteredFiles = files.filter((file) => `${file.filename} ${file.content_type} ${file.source}`.toLowerCase().includes(query.trim().toLowerCase()))
  const selectedFile = files.find((file) => file.id === selectedId) || filteredFiles[0]

  async function refresh() {
    try {
      const response = await api<{ files: MediaFile[] }>("/api/files")
      setFiles(response.files)
      setSelectedId((current) => current || response.files[0]?.id || "")
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

  async function deleteFile(id: string) {
    await api(`/api/files?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    setStatus("File removed.")
    setSelectedId("")
    await refresh()
  }

  async function copyLink(file: MediaFile) {
    await navigator.clipboard?.writeText(`${window.location.origin}/api/files/${file.id}/download`)
    setStatus("Download link copied.")
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Panel className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Files</h2>
            <p className="mt-1 text-sm text-muted-foreground">Upload, preview, download, copy links, and delete media in the isolated learn-files R2 bucket.</p>
          </div>
          <button onClick={() => inputRef.current?.click()} className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
            <Upload className="h-4 w-4" />
            Upload
          </button>
          <input ref={inputRef} type="file" className="hidden" onChange={(event) => upload(event.target.files?.[0])} />
        </div>
        <label className="mb-4 block">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filename, type, or source" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none" />
        </label>
        {status ? <p className="mb-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">{status}</p> : null}
        {filteredFiles.length ? options.fileLayout === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredFiles.map((file) => <FileCard key={file.id} file={file} selected={selectedFile?.id === file.id} preview={options.filePreview} onSelect={() => setSelectedId(file.id)} />)}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {filteredFiles.map((file) => (
              <button key={file.id} onClick={() => setSelectedId(file.id)} className={`grid w-full gap-3 border-b border-border p-3 text-left text-sm last:border-b-0 md:grid-cols-[1fr_130px_110px] md:items-center ${selectedFile?.id === file.id ? "bg-primary/10" : "hover:bg-muted"}`}>
                <div>
                  <div className="flex items-center gap-2">
                    {file.content_type.startsWith("image/") ? <ImageIcon className="h-4 w-4 text-success" /> : null}
                    {file.content_type.startsWith("video/") ? <Video className="h-4 w-4 text-success" /> : null}
                    <p className="font-medium text-foreground">{file.filename}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{file.content_type}</p>
                </div>
                <p className="text-muted-foreground">{formatBytes(file.size_bytes)}</p>
                <p className="text-muted-foreground">{formatDate(file.created_at)}</p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="No files yet" body="Upload PDFs, images, videos, and study materials to attach durable context to the workspace." />
        )}
      </Panel>

      <Panel className="p-4">
        <h3 className="font-semibold text-foreground">File actions</h3>
        {selectedFile ? (
          <div className="mt-3">
            {options.filePreview && selectedFile.content_type.startsWith("image/") ? (
              <img src={`/api/files/${selectedFile.id}/download`} alt="" className="aspect-video w-full rounded-md object-cover" />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted">
                {selectedFile.content_type.startsWith("video/") ? <Video className="h-8 w-8 text-success" /> : <ImageIcon className="h-8 w-8 text-success" />}
              </div>
            )}
            <p className="mt-3 break-words font-semibold text-foreground">{selectedFile.filename}</p>
            <p className="mt-1 text-sm text-muted-foreground">{formatBytes(selectedFile.size_bytes)} - {selectedFile.content_type}</p>
            <p className="mt-1 text-sm text-muted-foreground">Uploaded {formatDate(selectedFile.created_at)}</p>
            <div className="mt-4 grid gap-2">
              <a href={`/api/files/${selectedFile.id}/download`} className="flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-secondary text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                <Download className="h-4 w-4" />
                Download
              </a>
              <button onClick={() => copyLink(selectedFile)} className="flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-secondary text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                <Copy className="h-4 w-4" />
                Copy link
              </button>
              <button onClick={() => deleteFile(selectedFile.id)} className="flex h-10 items-center justify-center gap-2 rounded-md border border-destructive text-sm font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground">
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        ) : (
          <EmptyState title="No file selected" body="Choose a file to preview, download, copy, or delete it." />
        )}
      </Panel>
    </div>
  )
}

function FileCard({ file, selected, preview, onSelect }: { file: MediaFile; selected: boolean; preview: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className={`rounded-lg border p-3 text-left text-sm ${selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`}>
      {preview && file.content_type.startsWith("image/") ? (
        <img src={`/api/files/${file.id}/download`} alt="" className="mb-3 aspect-video w-full rounded-md object-cover" />
      ) : (
        <div className="mb-3 flex aspect-video items-center justify-center rounded-md bg-muted">
          {file.content_type.startsWith("video/") ? <Video className="h-7 w-7 text-success" /> : <ImageIcon className="h-7 w-7 text-success" />}
        </div>
      )}
      <p className="truncate font-medium text-foreground">{file.filename}</p>
      <p className="mt-1 text-xs text-muted-foreground">{formatBytes(file.size_bytes)} - {file.content_type}</p>
    </button>
  )
}

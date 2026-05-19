"use client"

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { ArrowRight, Copy, Download, FileText, ImageIcon, Info, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Trash2, Upload, Video } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { MediaFile, View } from "../types"
import { api, formatBytes, formatDate } from "../api"
import { EmptyState, Panel } from "../ui"
import { buildFileLibraryActionPlan, buildFileLibraryFilterSummary, filterFileLibrary, fileKindLabel, summarizeFileLibrary, type FileLibraryFilter } from "@/lib/file-library-features"
import { classifyUploadContentType, validateUploadFileShape } from "@/lib/file-security"

const mediaFilters: FileLibraryFilter[] = ["all", "image", "video", "audio", "pdf", "doc", "sheet", "slides"]

export function FilesView({ options, setView }: { options: WorkspaceOptions; setView?: (view: View) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [query, setQuery] = useState("")
  const [mediaFilter, setMediaFilter] = useState<FileLibraryFilter>("all")
  const [status, setStatus] = useState("Loading files...")
  const [dragActive, setDragActive] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState("")
  const [fileActionBusy, setFileActionBusy] = useState<"delete" | "copy" | null>(null)
  const storageStats = useMemo(() => summarizeFileLibrary(files), [files])
  const filteredFiles = useMemo(() => filterFileLibrary(files, { query, kind: mediaFilter }), [files, mediaFilter, query])
  const selectedFile = useMemo(() => files.find((file) => file.id === selectedId) || filteredFiles[0], [files, filteredFiles, selectedId])
  const filterSummary = useMemo(() => buildFileLibraryFilterSummary({
    filter: mediaFilter,
    query,
    total: files.length,
    visible: filteredFiles.length,
  }), [files.length, filteredFiles.length, mediaFilter, query])
  const fileActionPlan = useMemo(
    () => buildFileLibraryActionPlan(files, storageStats, { selectedId: selectedFile?.id, query, filter: mediaFilter, visibleFileCount: filteredFiles.length }),
    [files, filteredFiles.length, mediaFilter, query, selectedFile?.id, storageStats],
  )

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
    const validationError = validateUploadFileShape(file)
    if (validationError) {
      setStatus(validationError)
      if (inputRef.current) inputRef.current.value = ""
      return
    }
    setStatus("Uploading file...")
    const form = new FormData()
    form.set("file", file)
    try {
      await api("/api/files", { method: "POST", body: form })
      setStatus("Upload complete.")
      await refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.")
    } finally {
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function deleteFile(id: string) {
    if (fileActionBusy) return
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id)
      setStatus("Press Delete again to remove this file.")
      return
    }
    setFileActionBusy("delete")
    try {
      await api(`/api/files?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      setStatus("File removed.")
      setSelectedId("")
      setPendingDeleteId("")
      await refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to delete file.")
    } finally {
      setFileActionBusy(null)
    }
  }

  async function copyLink(file: MediaFile) {
    if (fileActionBusy) return
    setFileActionBusy("copy")
    try {
      await navigator.clipboard?.writeText(`${window.location.origin}/api/files/${file.id}/download`)
      setStatus("Download link copied.")
    } catch {
      setStatus("Unable to copy link. Use Download instead.")
    } finally {
      setFileActionBusy(null)
    }
  }

  function resetFilters() {
    setQuery("")
    setMediaFilter("all")
    setPendingDeleteId("")
  }

  function applyFileActionPlan() {
    if (fileActionPlan.nextAction === "upload") {
      inputRef.current?.click()
      return
    }
    if (fileActionPlan.nextAction === "clear-filter") {
      resetFilters()
      return
    }
    if (fileActionPlan.targetFileId) {
      setSelectedId(fileActionPlan.targetFileId)
    }
    if (fileActionPlan.nextAction === "open-studio") {
      setView?.("studio")
      return
    }
    if (fileActionPlan.nextAction === "download" && fileActionPlan.targetFileId) {
      window.location.assign(`/api/files/${fileActionPlan.targetFileId}/download`)
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    upload(event.dataTransfer.files?.[0])
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <Panel className={`p-4 transition ${dragActive ? "border-primary bg-primary/5" : ""}`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="text-2xl font-semibold text-foreground">Files</h2>
            <InfoMenu body="Drop in study sources, media, and exports for Studio or AI. Uploads are validated first and stored in LEARN object storage." label="About Files" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={resetFilters} className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
              <RefreshCw className="h-4 w-4" />
              Reset
            </button>
            <button onClick={() => inputRef.current?.click()} className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
              <Upload className="h-4 w-4" />
              Upload
            </button>
          </div>
          <input ref={inputRef} type="file" className="hidden" onChange={(event) => upload(event.target.files?.[0])} />
        </div>
        <label className="mb-3 flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-primary/25">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
        <details className="mb-3 rounded-md border border-border bg-background p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-success" />
              Browse
            </span>
            <span className="flex items-center gap-2">
              {filterSummary.active ? <span className="rounded-md bg-warning/15 px-2 py-0.5 text-xs text-warning">{filterSummary.label}</span> : null}
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{fileKindLabel(mediaFilter)}</span>
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{filteredFiles.length}/{files.length}</span>
            </span>
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex flex-wrap gap-2">
              {mediaFilters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => {
                    setMediaFilter(filter)
                    setPendingDeleteId("")
                  }}
                  className={`h-8 rounded-md px-3 text-xs font-semibold ${mediaFilter === filter ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
                >
                  {fileKindLabel(filter)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-muted-foreground sm:grid-cols-4 md:w-[360px]">
              <FileStat label="Files" value={String(storageStats.totalFiles)} />
              <FileStat label="Size" value={formatBytes(storageStats.totalBytes)} />
              <FileStat label="Media" value={String(storageStats.mediaCount)} />
              <FileStat label="Docs" value={String(storageStats.documentCount)} />
            </div>
          </div>
        </details>
        {status ? <p className="mb-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{status}</p> : null}
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
                  <p className="text-xs text-muted-foreground">{file.content_type} | {fileKindLabel(classifyUploadContentType(file.content_type))}</p>
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
      </div>

      <Panel className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground">Next action</h3>
          <InfoMenu body={fileActionPlan.detail} label="About next action" />
        </div>
        <button onClick={applyFileActionPlan} className="mt-3 w-full rounded-md border border-border bg-secondary p-3 text-left transition hover:bg-accent hover:text-accent-foreground">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-foreground">{fileActionPlan.headline}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {fileActionPlan.chips.map((chip) => (
              <span key={chip} className="rounded-md bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
                {chip}
              </span>
            ))}
          </div>
        </button>
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
            <p className="mt-1 text-sm text-muted-foreground">Kind: {fileKindLabel(classifyUploadContentType(selectedFile.content_type))}</p>
            <p className="mt-1 text-sm text-muted-foreground">Uploaded {formatDate(selectedFile.created_at)}</p>
            <details className="mt-3 rounded-md border border-border bg-background p-2 text-xs font-semibold text-muted-foreground">
              <summary className="cursor-pointer text-foreground">Security and storage</summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1"><ShieldCheck className="h-3 w-3" /> R2-backed</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1"><ShieldCheck className="h-3 w-3" /> Private route</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1"><ShieldCheck className="h-3 w-3" /> Validated type</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1"><ShieldCheck className="h-3 w-3" /> Downloadable</span>
              </div>
            </details>
            <div className="mt-4 grid gap-2">
              <a href={`/api/files/${selectedFile.id}/download`} className="flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-secondary text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                <Download className="h-4 w-4" />
                Download
              </a>
              <button onClick={() => copyLink(selectedFile)} disabled={fileActionBusy !== null} className="flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-secondary text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60">
                <Copy className="h-4 w-4" />
                {fileActionBusy === "copy" ? "Copying" : "Copy link"}
              </button>
              <button onClick={() => deleteFile(selectedFile.id)} disabled={fileActionBusy !== null} className="flex h-10 items-center justify-center gap-2 rounded-md border border-destructive text-sm font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-60">
                <Trash2 className="h-4 w-4" />
                {fileActionBusy === "delete" ? "Deleting" : pendingDeleteId === selectedFile.id ? "Confirm delete" : "Delete"}
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
  const kind = classifyUploadContentType(file.content_type)
  const Icon = kind === "video" ? Video : kind === "image" ? ImageIcon : FileText
  return (
    <button onClick={onSelect} className={`rounded-lg border p-3 text-left text-sm ${selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`}>
      {preview && file.content_type.startsWith("image/") ? (
        <img src={`/api/files/${file.id}/download`} alt="" className="mb-3 aspect-video w-full rounded-md object-cover" />
      ) : (
        <div className="mb-3 flex aspect-video items-center justify-center rounded-md bg-muted">
          <Icon className="h-7 w-7 text-success" />
        </div>
      )}
      <p className="truncate font-medium text-foreground">{file.filename}</p>
      <p className="mt-1 text-xs text-muted-foreground">{formatBytes(file.size_bytes)} - {fileKindLabel(kind)}</p>
    </button>
  )
}

function FileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-2 py-1.5">
      <p className="text-[0.66rem] uppercase tracking-[0.08em]">{label}</p>
      <p className="truncate text-foreground">{value}</p>
    </div>
  )
}

function InfoMenu({ body, label }: { body: string; label: string }) {
  return (
    <details className="relative shrink-0">
      <summary className="flex h-8 w-8 list-none items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground" aria-label={label} title={label}>
        <Info className="h-4 w-4" />
      </summary>
      <p className="absolute right-0 top-10 z-[80] w-72 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">
        {body}
      </p>
    </details>
  )
}

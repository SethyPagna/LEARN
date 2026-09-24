"use client"

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { ArrowRight, Copy, Download, Grid2X2, List, X, FileText, ImageIcon, Search, Trash2, Upload, Video } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { MediaFile, View } from "../types"
import { api, formatBytes, formatDate } from "../api"
import { buildFileLibraryActionPlan, buildFileLibraryEmptyState, buildFileLibraryFilterSummary, filterFileLibrary, fileKindLabel, resolveVisibleFileSelection, summarizeFileLibrary, type FileLibraryFilter, type FileLibraryKind } from "@/lib/file-library-features"
import { classifyUploadContentType, validateUploadFileShape } from "@/lib/file-security"

const mediaFilters: FileLibraryFilter[] = ["all", "image", "video", "audio", "pdf", "doc", "sheet", "slides"]

export function FilesView({ options, setView }: { options: WorkspaceOptions; setView?: (view: View) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [layout, setLayout] = useState(options.fileLayout)
  const [query, setQuery] = useState("")
  const [mediaFilter, setMediaFilter] = useState<FileLibraryFilter>("all")
  const [status, setStatus] = useState("Loading files...")
  const [dragActive, setDragActive] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState("")
  const [fileActionBusy, setFileActionBusy] = useState<"delete" | "copy" | null>(null)
  const storageStats = useMemo(() => summarizeFileLibrary(files), [files])
  const filteredFiles = useMemo(() => filterFileLibrary(files, { query, kind: mediaFilter }), [files, mediaFilter, query])
  const selectedFile = useMemo(() => resolveVisibleFileSelection(filteredFiles, selectedId), [filteredFiles, selectedId])
  const filterSummary = useMemo(() => buildFileLibraryFilterSummary({
    filter: mediaFilter,
    query,
    total: files.length,
    visible: filteredFiles.length,
  }), [files.length, filteredFiles.length, mediaFilter, query])
  const emptyState = useMemo(() => buildFileLibraryEmptyState({
    filter: mediaFilter,
    query,
    total: files.length,
  }), [files.length, mediaFilter, query])
  const fileActionPlan = useMemo(
    () => buildFileLibraryActionPlan(files, storageStats, { selectedId: selectedFile?.id, query, filter: mediaFilter, visibleFileCount: filteredFiles.length }),
    [files, filteredFiles.length, mediaFilter, query, selectedFile?.id, storageStats],
  )

  useEffect(() => setLayout(options.fileLayout), [options.fileLayout])

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

  return <section className="workspace-screen" aria-label="File library">
    <header className="workspace-header">
      <div><h2>Files</h2><p>{files.length} files · {formatBytes(storageStats.totalBytes)} used</p></div>
      <button type="button" onClick={() => inputRef.current?.click()} className="editor-primary"><Upload className="h-4 w-4" />Upload</button>
      <input ref={inputRef} type="file" aria-label="Upload files" className="hidden" onChange={(event) => upload(event.target.files?.[0])} />
    </header>
    <div className="workspace-toolbar">
      <label className="workspace-search flex-1 sm:max-w-sm"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input aria-label="Search files" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" /></label>
      <select aria-label="File type" value={mediaFilter} onChange={(event) => { setMediaFilter(event.target.value as FileLibraryFilter); setPendingDeleteId("") }} className="h-9 rounded-md border border-input bg-card px-3 text-xs">{mediaFilters.map((filter) => <option key={filter} value={filter}>{fileKindLabel(filter)}</option>)}</select>
      {filterSummary.active ? <button type="button" onClick={resetFilters} className="editor-command">Clear filters</button> : null}
      <div className="ml-auto flex rounded-md border border-border bg-card p-0.5"><button type="button" aria-label="List view" aria-pressed={layout === "list"} className="editor-command !px-2" onClick={() => setLayout("list")}><List className="h-4 w-4" /></button><button type="button" aria-label="Grid view" aria-pressed={layout === "grid"} className="editor-command !px-2" onClick={() => setLayout("grid")}><Grid2X2 className="h-4 w-4" /></button></div>
    </div>
    {status ? <p role="status" className="text-xs text-muted-foreground">{status}</p> : null}
    <div className={`grid min-w-0 items-start gap-4 ${detailsOpen ? "xl:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
      <div onDragOver={(event) => { event.preventDefault(); setDragActive(true) }} onDragLeave={() => setDragActive(false)} onDrop={handleDrop} className={`${detailsOpen && selectedFile ? "hidden xl:block" : ""} min-w-0 rounded-lg border bg-card ${dragActive ? "border-primary ring-2 ring-primary/20" : "border-border"}`}>
        {filteredFiles.length ? layout === "grid" ? <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">{filteredFiles.map((file) => <FileCard key={file.id} file={file} selected={detailsOpen && selectedFile?.id === file.id} preview={options.filePreview} onSelect={() => { setSelectedId(file.id); setDetailsOpen(true) }} />)}</div> : <>
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_110px] gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground md:grid"><span>Name</span><span>Size</span><span>Added</span></div>
          <ul className="divide-y divide-border">{filteredFiles.map((file) => <li key={file.id}><button type="button" aria-pressed={detailsOpen && selectedFile?.id === file.id} onClick={() => { setSelectedId(file.id); setDetailsOpen(true) }} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left text-sm md:grid-cols-[minmax(0,1fr)_110px_110px] ${detailsOpen && selectedFile?.id === file.id ? "bg-accent" : "hover:bg-secondary/60"}`}><span className="flex min-w-0 items-center gap-3"><FileKindIcon kind={classifyUploadContentType(file.content_type)} className="h-5 w-5 shrink-0 text-muted-foreground" /><span className="truncate">{file.filename}</span></span><span className="text-xs text-muted-foreground">{formatBytes(file.size_bytes)}</span><span className="hidden text-xs text-muted-foreground md:block">{formatDate(file.created_at)}</span></button></li>)}</ul>
        </> : <div className="grid justify-items-center gap-3 px-4 py-16 text-center"><Upload className="h-7 w-7 text-muted-foreground" /><h3 className="text-sm font-medium">{emptyState.title}</h3><p className="max-w-sm text-sm text-muted-foreground">{emptyState.body}</p><button type="button" className="editor-command" onClick={emptyState.action === "clear-filter" ? resetFilters : () => inputRef.current?.click()}>{emptyState.action === "clear-filter" ? "Clear filters" : "Choose a file"}</button></div>}
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{filteredFiles.length} shown · Drop files here to upload</div>
      </div>
      {detailsOpen && selectedFile ? <aside className="rounded-lg border border-border bg-card p-4" aria-label="File details">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">File details</h3><button type="button" aria-label="Close file details" className="editor-command !px-2" onClick={() => setDetailsOpen(false)}><X className="h-4 w-4" /></button></div>
        {options.filePreview && selectedFile.content_type.startsWith("image/") ? <img loading="lazy" src={`/api/files/${selectedFile.id}/download`} alt={selectedFile.filename} className="mb-4 max-h-52 w-full rounded-md object-contain" /> : null}
        <p className="break-words text-sm font-medium">{selectedFile.filename}</p><p className="mt-2 text-xs text-muted-foreground">{formatBytes(selectedFile.size_bytes)} · {fileKindLabel(classifyUploadContentType(selectedFile.content_type))}</p>
        <div className="mt-5 grid gap-2"><a href={`/api/files/${selectedFile.id}/download`} className="editor-primary"><Download className="h-4 w-4" />Download</a><button type="button" className="editor-command" onClick={applyFileActionPlan}>{fileActionPlan.headline}<ArrowRight className="h-4 w-4" /></button><button type="button" className="editor-command" disabled={fileActionBusy !== null} onClick={() => copyLink(selectedFile)}><Copy className="h-4 w-4" />Copy link</button><button type="button" className="editor-command !text-destructive" disabled={fileActionBusy !== null} onClick={() => deleteFile(selectedFile.id)}><Trash2 className="h-4 w-4" />{pendingDeleteId === selectedFile.id ? "Confirm delete" : "Delete"}</button></div>
      </aside> : null}
    </div>
  </section>
}

function FileCard({ file, selected, preview, onSelect }: { file: MediaFile; selected: boolean; preview: boolean; onSelect: () => void }) {
  const kind = classifyUploadContentType(file.content_type)
  return (
    <button onClick={onSelect} className={`rounded-lg border p-3 text-left text-sm ${selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`}>
      {preview && file.content_type.startsWith("image/") ? (
        <img src={`/api/files/${file.id}/download`} alt="" loading="lazy" decoding="async" className="mb-3 aspect-video w-full rounded-md object-cover" />
      ) : (
        <div className="mb-3 flex aspect-video items-center justify-center rounded-md bg-muted">
          <FileKindIcon kind={kind} className="h-7 w-7 text-success" />
        </div>
      )}
      <p className="truncate font-medium text-foreground">{file.filename}</p>
      <p className="mt-1 text-xs text-muted-foreground">{formatBytes(file.size_bytes)} - {fileKindLabel(kind)}</p>
    </button>
  )
}

function FileKindIcon({ className, kind }: { className?: string; kind: FileLibraryKind }) {
  if (kind === "video") return <Video className={className} />
  if (kind === "image") return <ImageIcon className={className} />
  return <FileText className={className} />
}

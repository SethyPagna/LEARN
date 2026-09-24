"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"
import { createElement } from "@/lib/studio/canvas-engine"
import { sanitizeImageUrl } from "@/lib/studio/canvas-styles"
import { addPage, duplicatePage, movePage, newDesignId, removePage, updatePage, type DesignDoc } from "@/lib/design/document"
import { pictureElement, textPresetElement } from "@/lib/design/editing"
import { clampZoom, fitZoom, stepZoom, type Point } from "@/lib/design/gestures"
import { resizeDesign } from "@/lib/design/layout"
import type { MeasureText } from "@/lib/design/text"
import type { Note } from "../types"
import { SharePanel } from "../share-panel"
import { ContextToolbar, type ToolbarActions } from "./context-toolbar"
import { DesignStage } from "./design-stage"
import { EditorPanel, EditorRail } from "./editor-rail"
import { isTypingTarget, useCompactLayout } from "./editor-hooks"
import type { DesignPanelId } from "./editor-types"
import { ExportMenu } from "./export-dialog"
import { pictureFilesFrom, uploadPicture } from "./image-upload"
import { PagesStrip } from "./pages-strip"
import { PresentMode } from "./present-mode"
import { ResizeMenu, type ResizeTarget } from "./resize-menu"
import { useDesignController } from "./use-design-controller"
import { useDesignSave } from "./use-design-save"

export interface OpenDesign { id: string; doc: DesignDoc; saved: DesignDoc | null; exists: boolean }
interface DesignEditorProps { opened: OpenDesign; notes: readonly Note[]; measure: MeasureText; onHome: () => void; onCreate: (doc: DesignDoc) => void }

export function DesignEditor({ opened, notes, measure, onHome, onCreate }: DesignEditorProps) {
  const [message, setMessage] = useState("")
  const notify = useCallback((message: string) => setMessage(message), [])
  const controller = useDesignController({ initial: opened.doc, notes, measure, notify })
  const { api, state, commands, undo } = controller
  const save = useDesignSave({ recordId: opened.id, design: api.design, initialSaved: opened.saved, exists: opened.exists })
  const compact = useCompactLayout()
  const [panel, setPanel] = useState<DesignPanelId | null>(compact ? null : "templates")
  const [zoom, setZoom] = useState(0.5)
  const [fit, setFit] = useState(true)
  const [snap, setSnap] = useState(true)
  const [grid, setGrid] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [cropping, setCropping] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [context, setContext] = useState<Point | null>(null)
  const [urlKind, setUrlKind] = useState<"image" | "embed">("image")
  const [url, setUrl] = useState("")
  const [urlOpen, setUrlOpen] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const replacement = useRef<string | null>(null)
  const interacting = useRef(false)
  const selection = api.design.pages[api.pageIndex].elements.filter((element) => api.selectedIds.includes(element.id))

  useEffect(() => { setEditingId(null); setCropping(false); setContext(null) }, [api.pageIndex])
  useEffect(() => { if (compact) setPanel(null) }, [compact])
  useEffect(() => {
    if (!selection.some((element) => element.id === editingId)) setEditingId(null)
    if (selection.length !== 1 || selection[0].type !== "image") setCropping(false)
  }, [api.selectedIds, editingId, selection])
  useEffect(() => {
    const node = viewport.current
    if (!node || !fit) return
    const resize = () => setZoom(fitZoom(api.design, { width: node.clientWidth, height: node.clientHeight }))
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(node)
    return () => observer.disconnect()
  }, [api.design.width, api.design.height, fit])
  useEffect(() => {
    if (!context) return
    const close = () => setContext(null)
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [context])
  useEffect(() => {
    const node = viewport.current
    if (!node) return
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setFit(false)
      setZoom((current) => clampZoom(current * (event.deltaY > 0 ? 0.9 : 1.1)))
    }
    node.addEventListener("wheel", wheel, { passive: false })
    return () => node.removeEventListener("wheel", wheel)
  }, [])

  function changeZoom(next: number) { setFit(false); setZoom(clampZoom(next)) }
  function goToPage(index: number) { setEditingId(null); setCropping(false); api.goToPage(index) }
  function travel(redo = false) { setEditingId(null); undo(redo) }
  function editText() {
    const element = selection.find((element) => !element.locked && !element.hidden && (element.type === "text" || element.type === "shape"))
    if (element) setEditingId(element.id)
  }
  const actions: ToolbarActions = { ...commands, editText, crop: () => setCropping((value) => !value), replacePicture: () => { replacement.current = selection[0]?.id ?? null; upload.current?.click() }, openPanel: setPanel }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isTypingTarget(event.target) || interacting.current || presenting) return
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    let handled = true
    if (mod && key === "z") travel(event.shiftKey)
    else if (mod && key === "y") travel(true)
    else if (mod && key === "s") void save.saveNow()
    else if (mod && key === "a") api.select(api.design.pages[api.pageIndex].elements.filter((element) => !element.hidden && !element.locked).map((element) => element.id))
    else if (mod && key === "d") commands.duplicate()
    else if (mod && key === "g") event.shiftKey ? commands.ungroup() : commands.group()
    else if (mod && key === "c") controller.copy()
    else if (mod && key === "x") { controller.copy(); commands.remove() }
    else if (key === "delete" || key === "backspace") commands.remove()
    else if (key === "escape") { setContext(null); setCropping(false); setEditingId(null); api.select([]) }
    else if (key === "enter") editText()
    else if (!mod && !event.altKey && key === "t") api.insertElements([textPresetElement("body", api.theme, api.design, measure)])
    else if (key === "pageup") goToPage(api.pageIndex - 1)
    else if (key === "pagedown") goToPage(api.pageIndex + 1)
    else if (mod && (key === "=" || key === "+")) changeZoom(stepZoom(zoom, 1))
    else if (mod && key === "-") changeZoom(stepZoom(zoom, -1))
    else if (mod && key === "0") setFit(true)
    else if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
      const step = event.shiftKey ? 10 : 1
      controller.nudge(key === "arrowleft" ? -step : key === "arrowright" ? step : 0, key === "arrowup" ? -step : key === "arrowdown" ? step : 0)
    } else handled = false
    if (handled) { event.preventDefault(); event.stopPropagation() }
  }

  function insertUrl() {
    const source = sanitizeImageUrl(url)
    if (!source) { notify("Use a valid https:// image or embed URL."); return }
    const element = urlKind === "image" ? pictureElement(source, null, api.design) : createElement({ type: "embed", content: source, width: Math.min(480, api.design.width / 2), height: Math.min(260, api.design.height / 2) })
    api.insertElements([element]); setUrl(""); setUrlOpen(false)
  }
  async function pickedFiles(files: File[]) {
    const id = replacement.current
    replacement.current = null
    if (!id) { await api.uploadFiles(files); return }
    if (!files[0]) return
    try {
      const picture = await uploadPicture(files[0])
      api.update((doc) => ({ ...doc, pages: doc.pages.map((page) => ({ ...page, elements: page.elements.map((element) => element.id === id ? { ...element, content: picture.src } : element) })) }))
      notify("Picture replaced.")
    } catch (error) { notify(error instanceof Error ? error.message : "Picture could not be replaced.") }
  }
  function resize(target: ResizeTarget, copy: boolean) {
    const next = resizeDesign(api.design, target, { mode: target.mode, measure })
    if (copy) onCreate({ ...next, id: newDesignId("design"), name: `${next.name} copy` })
    else api.update(() => next)
  }

  return <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card" tabIndex={-1} onKeyDown={onKeyDown} onPointerDownCapture={(event) => {
    if (editingId && !(event.target as HTMLElement).closest("[data-keep-editing]")) setEditingId(null)
  }} onPaste={(event) => {
    if (isTypingTarget(event.target)) return
    const files = pictureFilesFrom(event.clipboardData)
    event.preventDefault()
    if (files.length) void api.uploadFiles(files)
    else controller.paste()
  }}>
    <header className="flex flex-wrap items-center gap-2 border-b border-border p-2">
      <button type="button" className="canvas-tool" onClick={() => { void save.saveNow().then(onHome) }}>Studio home</button>
      <input aria-label="Design title" className="min-w-32 flex-1 rounded-lg bg-transparent px-2 py-1 font-semibold" value={api.design.name} maxLength={200} onChange={(event) => api.update((doc) => ({ ...doc, name: event.target.value }), { coalesce: "title" })} />
      <span role="status" className="text-xs text-muted-foreground">{save.status === "error" ? "Save failed — draft kept" : save.status === "saving" ? "Saving…" : save.status === "dirty" ? "Unsaved changes" : save.exists ? "Saved" : "New design"}</span>
      <button type="button" className="canvas-tool" onClick={() => void save.saveNow()}>Save</button>
      <button type="button" className="canvas-tool" aria-label="Undo" disabled={!state.history.canUndo} onClick={() => travel()}>↶</button>
      <button type="button" className="canvas-tool" aria-label="Redo" disabled={!state.history.canRedo} onClick={() => travel(true)}>↷</button>
      <ResizeMenu design={api.design} onResize={(target) => resize(target, false)} onResizeCopy={(target) => resize(target, true)} />
      <ExportMenu design={api.design} pageIndex={api.pageIndex} onNotify={notify} onBeforeExport={() => setEditingId(null)} />
      <button type="button" className="canvas-tool" onClick={() => { setEditingId(null); setPresenting(true) }}>Present</button>
    </header>
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
      <SharePanel sourceTable="editor_documents" sourceId={save.exists ? opened.id : ""} triggerClassName="canvas-tool" requiresSourceMessage="Save this design before creating a share link." />
      <button type="button" className="canvas-tool" onClick={() => { replacement.current = null; upload.current?.click() }}>Upload picture</button>
      <button type="button" className="canvas-tool" aria-expanded={urlOpen} onClick={() => setUrlOpen((value) => !value)}>Insert URL</button>
      <button type="button" className="canvas-tool" aria-pressed={snap} onClick={() => setSnap((value) => !value)}>Snap</button>
      <button type="button" className="canvas-tool" aria-pressed={grid} onClick={() => setGrid((value) => !value)}>Grid</button>
    </div>
    <input ref={upload} type="file" accept="image/*" multiple className="hidden" aria-label="Upload design pictures" onChange={(event) => { void pickedFiles(Array.from(event.target.files ?? [])); event.target.value = "" }} />
    {urlOpen ? <form className="flex flex-wrap gap-2 p-2" onSubmit={(event) => { event.preventDefault(); insertUrl() }}><select aria-label="URL type" value={urlKind} onChange={(event) => setUrlKind(event.target.value as "image" | "embed")}><option value="image">Picture</option><option value="embed">Embed link</option></select><input aria-label="Image or embed URL" className="min-w-0 flex-1 rounded border px-2" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /><button className="canvas-tool" type="submit">Insert</button></form> : null}
    {save.error ? <p role="alert" className="px-3 py-2 text-sm text-destructive">{save.error}</p> : null}
    {message ? <p role="status" className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground">{message}<button aria-label="Dismiss message" onClick={() => setMessage("")}>×</button></p> : null}
    <ContextToolbar api={api} selection={selection} actions={actions} cropping={cropping} />
    <div className="relative flex min-h-0" style={{ height: "min(65vh, 720px)", minHeight: 320 }}>
      {!compact ? <EditorRail panel={panel} onPanel={setPanel} compact={false} /> : null}
      <EditorPanel api={api} panel={panel} onPanel={setPanel} compact={compact} />
      <div ref={viewport} className="min-w-0 flex-1 overflow-auto bg-muted/60">
        <div className="flex min-h-full min-w-full items-center justify-center p-8" style={{ width: api.design.width * zoom + 64, height: api.design.height * zoom + 64 }}>
          <DesignStage key={api.design.pages[api.pageIndex].id} api={api} zoom={zoom} snap={snap} grid={grid} editingId={editingId} cropping={cropping} onEdit={setEditingId} onUndo={travel} onInteraction={(busy) => { interacting.current = busy }} onContext={setContext} />
        </div>
      </div>
    </div>
    <footer className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border p-2">
      <PagesStrip design={api.design} pageIndex={api.pageIndex} measure={measure} onSelect={goToPage} onAdd={(index) => api.update((doc) => { const result = addPage(doc, index); return { doc: result.doc, page: result.index, select: [] } })} onDuplicate={(index) => api.update((doc) => { const result = duplicatePage(doc, index); return { doc: result.doc, page: result.index, select: [] } })} onRemove={(index) => api.update((doc) => { const result = removePage(doc, index); return { doc: result.doc, page: result.index, select: [] } })} onMove={(from, to) => api.update((doc) => { const id = doc.pages[api.pageIndex].id; const next = movePage(doc, from, to); return { doc: next, page: next.pages.findIndex((page) => page.id === id) } })} onToggleHidden={(index) => api.update((doc) => updatePage(doc, index, { hidden: !doc.pages[index].hidden }))} />
      <button type="button" className="canvas-tool" aria-label="Zoom out" onClick={() => changeZoom(stepZoom(zoom, -1))}>−</button><span className="text-xs">{Math.round(zoom * 100)}%</span><button type="button" className="canvas-tool" aria-label="Zoom in" onClick={() => changeZoom(stepZoom(zoom, 1))}>+</button><button type="button" className="canvas-tool" onClick={() => setFit(true)}>Fit</button>
    </footer>
    <details className="border-t border-border px-3 py-2"><summary className="cursor-pointer text-xs">Page notes</summary><textarea aria-label="Speaker notes" className="mt-2 min-h-20 w-full rounded border bg-background p-2 text-sm" value={api.design.pages[api.pageIndex].notes} onChange={(event) => api.update((doc) => updatePage(doc, api.pageIndex, { notes: event.target.value }), { coalesce: `notes:${api.design.pages[api.pageIndex].id}` })} /></details>
    {compact ? <EditorRail panel={panel} onPanel={setPanel} compact /> : null}
    {context ? <div role="menu" className="fixed z-50 grid min-w-44 gap-1 rounded-xl border bg-card p-2 shadow-xl" style={{ left: Math.max(8, Math.min(context.x, window.innerWidth - 210)), top: Math.max(8, Math.min(context.y, window.innerHeight - 300)) }} onPointerDown={(event) => event.stopPropagation()}>
      {([ ["Copy", controller.copy], ["Paste", controller.paste], ["Duplicate", commands.duplicate], ["Group", commands.group], ["Ungroup", commands.ungroup], ["Lock / unlock", commands.toggleLock], ["Bring to front", () => commands.reorder("front")], ["Delete", commands.remove] ] as const).map(([label, action]) => <button key={label} type="button" role="menuitem" className="rounded px-3 py-1 text-left text-sm hover:bg-muted" onClick={() => { action(); setContext(null) }}>{label}</button>)}
    </div> : null}
    {presenting ? <PresentMode design={api.design} startIndex={api.pageIndex} measure={measure} onClose={(index) => { setPresenting(false); goToPage(index) }} /> : null}
  </div>
}

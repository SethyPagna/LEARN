"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import Link from "next/link"
import { ArrowRight, Bold, Check, Copy, Download, MoveUp, Pencil, Redo2, RotateCcw, Shapes, Trash2, Type, Undo2 } from "lucide-react"
import { DesignStage } from "@/components/learn/design/design-stage"
import { useDesignController } from "@/components/learn/design/use-design-controller"
import { useDesignMeasure } from "@/components/learn/design/text-measure"
import { createElement } from "@/lib/studio/canvas-engine"
import { DESIGN_LIMITS, newDesignId, pageCanvas, withPageCanvas } from "@/lib/design/document"
import { growText, setElementStyle } from "@/lib/design/editing"
import { createPublicDemo, demoPageColors } from "@/lib/design/public-demo"
import { readShapeStyle, readTextStyle } from "@/lib/design/style"
import styles from "./public-demo-editor.module.css"

function layerName(element: { type: string; content: string }, index: number) {
  return element.content.split("\n")[0].slice(0, 30) || `${element.type === "shape" ? "Shape" : "Layer"} ${index + 1}`
}

export function PublicDemoEditor() {
  const initial = useMemo(createPublicDemo, [])
  const measure = useDesignMeasure()
  const stageArea = useRef<HTMLDivElement>(null)
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const downloadBusy = useRef(false)
  const [message, setMessage] = useState("")
  const [zoom, setZoom] = useState(0.4)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [textFieldOpen, setTextFieldOpen] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const notify = useCallback((text: string) => {
    setMessage(text)
    if (messageTimer.current) clearTimeout(messageTimer.current)
    messageTimer.current = setTimeout(() => setMessage(""), 3500)
  }, [])
  const controller = useDesignController({ initial, notes: [], measure, notify })
  const { api, state, commands, undo } = controller
  const page = api.design.pages[0]
  const selected = api.selectedIds.length === 1 ? page.elements.find((element) => element.id === api.selectedIds[0]) : undefined
  const text = selected?.type === "text" ? readTextStyle(selected) : null
  const shape = selected?.type === "shape" ? readShapeStyle(selected) : null
  const selectionColor = text?.color ?? shape?.fill ?? "#786fbd"
  const localApi = { ...api, uploadFiles: async () => notify("Open Studio to upload your own files.") }

  useEffect(() => {
    const area = stageArea.current
    if (!area) return
    function fit() {
      if (!area || area.clientWidth === 0 || area.clientHeight === 0) return
      const style = getComputedStyle(area)
      const width = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const height = area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      setZoom(Math.max(0.05, Math.min(width / initial.width, height / initial.height)))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(area)
    return () => observer.disconnect()
  }, [initial.width, initial.height])

  useEffect(() => () => { if (messageTimer.current) clearTimeout(messageTimer.current) }, [])

  function changeStyle(patch: Record<string, unknown>) {
    const ids = new Set(api.selectedIds)
    api.update((doc) => {
      const canvas = pageCanvas(doc, 0)
      return withPageCanvas(doc, 0, { ...canvas, elements: canvas.elements.map((element) => ids.has(element.id) ? growText(setElementStyle(element, patch), measure) : element) })
    }, { coalesce: `demo-style:${Object.keys(patch).sort().join(",")}` })
  }

  function changePageColor(color: string) {
    setEditingId(null)
    api.update((doc) => ({ ...doc, pages: [{ ...doc.pages[0], background: color, backgroundRole: null }] }), { coalesce: "demo-page-color" })
  }

  function addElement(type: "text" | "shape") {
    if (page.elements.length >= DESIGN_LIMITS.elementsPerPage) { notify("This page is full. Remove an element to add another."); return }
    setEditingId(null)
    const element = type === "text"
      ? createElement({ id: newDesignId("demo-text"), type, width: 590, height: 100, content: "Your next idea", style: { fontFamily: "sans", fontSize: 72, fontWeight: 600, color: "#252444", fit: "grow", padding: 0, lineHeight: 1.1 } })
      : createElement({ id: newDesignId("demo-shape"), type, width: 180, height: 180, style: { shape: "ellipse", fill: "#f5ae91", strokeWidth: 0 } })
    api.insertElements([element])
    setTextFieldOpen(type === "text")
  }

  function selectLayer(id: string) {
    setEditingId(null)
    setTextFieldOpen(false)
    api.select(id ? [id] : [])
  }

  function travelHistory(redo = false) {
    setEditingId(null)
    setTextFieldOpen(false)
    undo(redo)
  }

  function removeSelection() {
    setEditingId(null)
    setTextFieldOpen(false)
    commands.remove()
  }

  function editText() {
    if (!selected) return
    setEditingId(null)
    setTextFieldOpen((open) => !open)
  }

  function changeText(content: string) {
    if (!selected) return
    const id = selected.id
    api.update((doc) => {
      const canvas = pageCanvas(doc, 0)
      return withPageCanvas(doc, 0, { ...canvas, elements: canvas.elements.map((element) => element.id === id ? growText({ ...element, content: content.slice(0, DESIGN_LIMITS.contentLength) }, measure) : element) })
    }, { coalesce: `text:${id}` })
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || event.key === "Process") return
    if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (mod && (key === "z" || key === "y")) { event.preventDefault(); travelHistory(key === "y" || event.shiftKey); return }
    if (mod && key === "d" && api.selectedIds.length) { event.preventDefault(); commands.duplicate(); return }
    if (!(event.target as HTMLElement).closest("[role=application]")) return
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removeSelection(); return }
    if (event.key === "Escape") { setEditingId(null); setTextFieldOpen(false); api.select([]); return }
    if (event.key === "Enter" && selected) { event.preventDefault(); setTextFieldOpen(true); return }
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (moves[event.key] && api.selectedIds.length) {
      event.preventDefault()
      const [dx, dy] = moves[event.key]
      const step = event.shiftKey ? 10 : 1
      controller.nudge(dx * step, dy * step)
    }
  }

  async function download() {
    if (downloadBusy.current) return
    downloadBusy.current = true
    setDownloading(true)
    try {
      const { exportDesign } = await import("@/components/learn/design/design-export")
      await exportDesign(api.design, { format: "png", quality: "standard" })
      notify("Image downloaded.")
    } catch { notify("Could not download the image. Please try again.") }
    finally { downloadBusy.current = false; setDownloading(false) }
  }

  return <div className={styles.editor} aria-label="Try the Studio editor" onKeyDown={onKeyDown} data-demo-editor="">
    <div className={styles.toolbar} role="toolbar" aria-label="Demo editor actions">
      <button type="button" aria-label="Undo" title="Undo" disabled={!state.history.canUndo || interacting} onClick={() => travelHistory()}><Undo2 size={16} /></button>
      <button type="button" aria-label="Redo" title="Redo" disabled={!state.history.canRedo || interacting} onClick={() => travelHistory(true)}><Redo2 size={16} /></button>
      <span className={styles.divider} />
      <button type="button" aria-label="Add text" title="Add text" disabled={interacting} onClick={() => addElement("text")}><Type size={17} /><span>Text</span></button>
      <button type="button" aria-label="Add shape" title="Add shape" disabled={interacting} onClick={() => addElement("shape")}><Shapes size={17} /><span>Shape</span></button>
      <button type="button" aria-label="Reset demo" title="Reset demo" data-action="reset" disabled={!state.history.canUndo || interacting} onClick={() => { setEditingId(null); setTextFieldOpen(false); api.update(() => ({ doc: createPublicDemo(), select: [] })); notify("Fresh canvas. Undo brings your edits back.") }}><RotateCcw size={16} /></button>
    </div>
    <div className={styles.context} role="toolbar" aria-label="Selection tools" data-keep-editing="true">
      {api.selectedIds.length ? <>
        {text && <>
          <select aria-label="Font" value={text.font} onChange={(event) => changeStyle({ fontFamily: event.target.value })}><option value="sans">Sans</option><option value="space">Space</option><option value="playfair">Serif</option><option value="caveat">Handwritten</option></select>
          <input type="number" aria-label="Font size" min={6} max={300} value={Math.round(text.size)} onChange={(event) => { const size = event.currentTarget.valueAsNumber; if (Number.isFinite(size)) changeStyle({ fontSize: Math.max(6, Math.min(300, size)) }) }} />
          <button type="button" aria-label="Bold" title="Bold" aria-pressed={text.weight >= 600} onClick={() => changeStyle({ fontWeight: text.weight >= 600 ? 400 : 700 })}><Bold size={16} /></button>
        </>}
        {shape && <select aria-label="Shape" value={shape.shape} onChange={(event) => changeStyle({ shape: event.target.value })}><option value="ellipse">Circle</option><option value="rounded">Rounded</option><option value="star">Star</option><option value="burst">Burst</option><option value="heart">Heart</option></select>}
        {selected && <label className={styles.color} title={text ? "Text color" : "Shape color"}><span style={{ background: selectionColor }} /><input type="color" aria-label={text ? "Text color" : "Shape color"} value={selectionColor} onChange={(event) => changeStyle(text ? { color: event.target.value } : { fill: event.target.value })} /></label>}
        {selected && <button type="button" aria-label={text ? "Edit text" : "Edit label"} title={text ? "Edit text" : "Edit label"} aria-pressed={textFieldOpen} onClick={editText}><Pencil size={16} /></button>}
        <button type="button" aria-label="Duplicate selection" title="Duplicate" onClick={commands.duplicate}><Copy size={16} /></button>
        <button type="button" aria-label="Bring forward" title="Bring forward" onClick={() => commands.reorder("forward")}><MoveUp size={16} /></button>
        <button type="button" aria-label="Delete selection" title="Delete" onClick={removeSelection}><Trash2 size={16} /></button>
      </> : <>
        <span className={styles.contextLabel}>Page</span>
        <div className={styles.swatches} role="group" aria-label="Try a canvas color">{demoPageColors.map(({ name, value }) => <button key={name} type="button" aria-label={name} title={name} aria-pressed={page.background === value} onClick={() => changePageColor(value)}><span style={{ background: value }}>{page.background === value && <Check size={13} />}</span></button>)}</div>
        <label className={styles.color} title="Page color"><span style={{ background: page.background }} /><input type="color" aria-label="Page color" value={page.background} onChange={(event) => changePageColor(event.target.value)} /></label>
      </>}
    </div>
    {textFieldOpen && selected && <div className={styles.textField}><textarea autoFocus aria-label={text ? "Edit selected text" : "Edit selected label"} maxLength={DESIGN_LIMITS.contentLength} value={selected.content} onChange={(event) => changeText(event.target.value)} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing || event.key === "Process") return
      if (event.key === "Escape") { event.preventDefault(); setTextFieldOpen(false) }
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) { event.preventDefault(); travelHistory(key === "y" || event.shiftKey) }
    }} /><button type="button" aria-label="Done editing text" title="Done" onClick={() => setTextFieldOpen(false)}><Check size={18} /></button></div>}
    <div ref={stageArea} className={styles.stageArea}>
      <DesignStage api={localApi} zoom={zoom} snap grid={false} editingId={editingId} cropping={false} onEdit={(id) => { setTextFieldOpen(false); setEditingId(id) }} onUndo={travelHistory} onInteraction={setInteracting} onContext={() => {}} />
    </div>
    <div className={styles.footer}>
      <select className={styles.layers} aria-label="Select layer" value={selected?.id ?? ""} onChange={(event) => selectLayer(event.target.value)}><option value="">Page</option>{page.elements.map((element, index) => <option key={element.id} value={element.id}>{layerName(element, index)}</option>)}</select>
      <div className={styles.footerActions}><button type="button" aria-label="Download demo image" title="Download image" disabled={downloading} onClick={() => void download()}><Download size={16} /></button><Link href="/dashboard" aria-label="Open Studio workspace">Open Studio<ArrowRight size={13} /></Link></div>
    </div>
    <p className={styles.hint}>Select, drag, edit. · Local demo · Download to keep it.</p>
    {message && <div className={styles.status} role="status">{message}</div>}
  </div>
}

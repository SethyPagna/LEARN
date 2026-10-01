"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Check, Download, Layers, NotebookPen, Palette, Play, Redo2, RotateCcw, Shapes, Sparkles, Type, Undo2, X } from "lucide-react"
import { ContextToolbar, type ToolbarActions } from "@/components/learn/design/context-toolbar"
import { DesignStage } from "@/components/learn/design/design-stage"
import { useLatest } from "@/components/learn/design/editor-hooks"
import { FitThumbnail } from "@/components/learn/design/fit-thumbnail"
import { PagesStrip } from "@/components/learn/design/pages-strip"
import { PresentMode } from "@/components/learn/design/present-mode"
import { LayersPanel, layerLabel } from "@/components/learn/design/panels/layers-panel"
import { SelectionPanel } from "@/components/learn/design/panels/selection-panel"
import { StylesPanel } from "@/components/learn/design/panels/styles-panel"
import { TextPanel } from "@/components/learn/design/panels/text-panel"
import { useDesignController } from "@/components/learn/design/use-design-controller"
import { useDesignMeasure } from "@/components/learn/design/text-measure"
import { createElement } from "@/lib/studio/canvas-engine"
import { addPage, createDesignPage, DESIGN_LIMITS, duplicatePage, movePage, newDesignId, removePage, updatePage, type DesignDoc } from "@/lib/design/document"
import { createPublicDemoProjects, demoPageColors, publicDemoProjects } from "@/lib/design/public-demo"
import { SHAPE_LABELS, shapePath, type ShapeKind } from "@/lib/design/shapes"
import type { MeasureText } from "@/lib/design/text"
import type { DesignPanelId } from "@/components/learn/design/editor-types"
import styles from "./public-demo-editor.module.css"

const TOUR_STEPS = ["Pick a project.", "Try the text tools.", "Add a little personality.", "Add a page. Download it."] as const
const DEMO_SHAPES: readonly ShapeKind[] = ["ellipse", "rounded", "star", "burst", "heart", "speech"]
const PANEL_LABELS: Partial<Record<DesignPanelId, string>> = { text: "Text", elements: "Elements", layers: "Layers", styles: "Styles", "text-color": "Text color", "text-effects": "Effects" }
type DemoController = ReturnType<typeof useDesignController>

export function PublicDemoEditor() {
  const initial = useMemo(createPublicDemoProjects, [])
  const measure = useDesignMeasure()
  const [projectIndex, setProjectIndex] = useState(0)
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [message, setMessage] = useState("")
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notify = useCallback((text: string) => {
    setMessage(text)
    if (messageTimer.current) clearTimeout(messageTimer.current)
    messageTimer.current = setTimeout(() => setMessage(""), 3500)
  }, [])
  // Controllers stay mounted: each project's edits, pages and undo history survive a switch.
  const canvas = useDesignController({ initial: initial[0], notes: [], measure, notify })
  const slides = useDesignController({ initial: initial[1], notes: [], measure, notify })
  const poster = useDesignController({ initial: initial[2], notes: [], measure, notify })
  const controllers = [canvas, slides, poster]
  const controller = controllers[projectIndex]
  useEffect(() => () => { if (messageTimer.current) clearTimeout(messageTimer.current) }, [])

  return <div className={styles.editor} aria-label="Try the Studio editor" data-demo-editor="" data-tour-step={tourStep ?? undefined}>
    <div className={styles.studioBar}><span className={styles.studioLabel}><Layers size={14} />Projects</span><button type="button" className={styles.tourButton} aria-label="Start guided Studio tour" onClick={() => setTourStep(0)}><Sparkles size={13} /><span>Quick tour</span></button></div>
    <div className={styles.projects} role="group" aria-label="Demo projects">{publicDemoProjects.map((project, index) => {
      const design = controllers[index].api.design
      return <button type="button" key={project.id} aria-label={`Open ${project.label} demo project`} aria-pressed={projectIndex === index} onClick={() => { setProjectIndex(index); setMessage("") }}><span className={styles.projectCover}><FitThumbnail width={design.width} height={design.height} theme={design.theme} page={design.pages[0]} measure={measure} /></span><span className={styles.projectLabel}><strong>{project.label}</strong><span>{project.name}</span></span></button>
    })}</div>
    {tourStep !== null && <div className={styles.tour} role="region" aria-label="Studio guided tour"><span className={styles.tourCount}>{tourStep + 1}<span>/ {TOUR_STEPS.length}</span></span><p aria-live="polite">{TOUR_STEPS[tourStep]}</p><div className={styles.tourActions}>{tourStep > 0 && <button type="button" aria-label="Previous tutorial step" onClick={() => setTourStep(step => Math.max(0, (step ?? 0) - 1))}><ArrowLeft size={14} /></button>}<button type="button" className={styles.tourNext} aria-label={tourStep === TOUR_STEPS.length - 1 ? "Finish tutorial" : "Next tutorial step"} onClick={() => setTourStep(step => step === TOUR_STEPS.length - 1 ? null : (step ?? 0) + 1)}>{tourStep === TOUR_STEPS.length - 1 ? <Check size={15} /> : <ArrowRight size={15} />}</button><button type="button" aria-label="Skip tutorial" onClick={() => setTourStep(null)}><X size={13} /></button></div></div>}
    <DemoWorkspace key={publicDemoProjects[projectIndex].id} controller={controller} initial={initial[projectIndex]} measure={measure} tourStep={tourStep} notify={notify} />
    {message && <div className={styles.status} role="status">{message}</div>}
  </div>
}

function DemoWorkspace({ controller, initial, measure, tourStep, notify }: { controller: DemoController; initial: DesignDoc; measure: MeasureText; tourStep: number | null; notify: (message: string) => void }) {
  const { api, state, commands, undo } = controller
  const latestApi = useLatest(api)
  const page = api.design.pages[api.pageIndex]
  const selection = page.elements.filter(element => api.selectedIds.includes(element.id))
  const selected = selection.length === 1 ? selection[0] : null
  const stageArea = useRef<HTMLDivElement>(null)
  const downloadBusy = useRef(false)
  const [zoom, setZoom] = useState(0.4)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [panel, setPanel] = useState<DesignPanelId | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const localApi = { ...api, uploadFiles: async () => notify("Picture uploads are available in the full Studio.") }

  useEffect(() => {
    const area = stageArea.current
    if (!area) return
    function fit() {
      if (!area || area.clientWidth === 0 || area.clientHeight === 0) return
      const style = getComputedStyle(area)
      const width = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const height = area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      setZoom(Math.max(0.05, Math.min(width / api.design.width, height / api.design.height)))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(area)
    return () => observer.disconnect()
  }, [api.design.width, api.design.height])

  useEffect(() => {
    const currentApi = latestApi.current
    if (tourStep === 1) {
      currentApi.goToPage(0)
      const title = currentApi.design.pages[0].elements.find(element => element.type === "text" && !element.locked && /heading/.test(element.id))
      if (title) currentApi.select([title.id])
      setPanel(null)
      setEditingId(null)
    } else if (tourStep === 2) setPanel("elements")
    else if (tourStep === 3) { setPanel(null); setEditingId(null) }
  }, [latestApi, tourStep])

  useEffect(() => { if (!api.selectedIds.includes(editingId ?? "")) setEditingId(null) }, [api.selectedIds, editingId])

  function goToPage(index: number) { setEditingId(null); setPanel(null); api.goToPage(index) }
  function travelHistory(redo = false) { setEditingId(null); undo(redo) }
  function editText() {
    const element = selection.find(candidate => !candidate.locked && !candidate.hidden && (candidate.type === "text" || candidate.type === "shape" || candidate.type === "table"))
    if (element) setEditingId(element.id)
  }
  function removeSelection() { setEditingId(null); commands.remove() }
  function togglePanel(next: DesignPanelId) { setPanel(current => current === next ? null : next) }
  function changePageColor(color: string) { setEditingId(null); api.update(doc => updatePage(doc, api.pageIndex, { background: color, backgroundRole: null }), { coalesce: `demo-page-color:${page.id}` }) }
  function insertShape(kind: ShapeKind = "ellipse") {
    const size = Math.min(api.design.width, api.design.height) * 0.3
    api.insertElements([createElement({ id: newDesignId("demo-shape"), type: "shape", width: size, height: size, style: { shape: kind, fill: "#f5ae91", strokeWidth: 0 } })])
    setEditingId(null); setPanel(null)
  }
  function insertText() {
    const size = Math.round(Math.min(api.design.width, api.design.height) * 0.1)
    const element = createElement({ id: newDesignId("demo-text"), type: "text", width: Math.min(api.design.width * 0.65, size * 9), height: size * 1.5, content: "Your next idea", style: { fontFamily: "sans", fontSize: size, fontWeight: 600, color: api.theme.palette.text, fit: "grow", padding: 0, lineHeight: 1.1 } })
    api.insertElements([element]); setEditingId(element.id); setPanel(null)
  }
  function addDemoPage(after: number) {
    if (api.design.pages.length >= DESIGN_LIMITS.pages) { notify("This project has enough pages. Remove a page to add another."); return }
    setEditingId(null)
    api.update(doc => { const result = addPage(doc, after, createDesignPage({ background: doc.pages[api.pageIndex].background })); return { doc: result.doc, page: result.index, select: [] } })
  }
  const actions: ToolbarActions = { ...commands, editText, remove: removeSelection, crop: () => {}, replacePicture: () => {}, openPanel: setPanel }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.key === "Process" || interacting || presenting) return
    if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (mod && (key === "z" || key === "y")) { event.preventDefault(); travelHistory(key === "y" || event.shiftKey); return }
    if (mod && key === "d" && api.selectedIds.length) { event.preventDefault(); commands.duplicate(); return }
    if (mod && event.key === "Enter") { event.preventDefault(); addDemoPage(api.pageIndex); return }
    if (!(event.target as HTMLElement).closest("[role=application]")) return
    if (!mod && !event.altKey && key === "t") { event.preventDefault(); insertText(); return }
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removeSelection(); return }
    if (event.key === "Escape") { setEditingId(null); setPanel(null); api.select([]); return }
    if (event.key === "Enter" && selected) { event.preventDefault(); editText(); return }
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (moves[event.key] && api.selectedIds.length) { event.preventDefault(); const [dx, dy] = moves[event.key]; const step = event.shiftKey ? 10 : 1; controller.nudge(dx * step, dy * step) }
  }
  async function download() {
    if (downloadBusy.current) return
    downloadBusy.current = true; setDownloading(true)
    try {
      const { exportDesign } = await import("@/components/learn/design/design-export")
      await exportDesign(api.design, { format: "png", pages: [api.pageIndex], quality: "standard" })
      notify("Page downloaded.")
    } catch { notify("Could not download the image. Please try again.") }
    finally { downloadBusy.current = false; setDownloading(false) }
  }

  return <div className={styles.workspace} onKeyDown={onKeyDown}>
    <div className={styles.toolbar} role="toolbar" aria-label="Demo editor actions"><span className={styles.projectTitle}>{api.design.name}</span>
      <button type="button" aria-label="Undo" title="Undo" disabled={!state.history.canUndo || interacting} onClick={() => travelHistory()}><Undo2 size={15} /></button>
      <button type="button" aria-label="Redo" title="Redo" disabled={!state.history.canRedo || interacting} onClick={() => travelHistory(true)}><Redo2 size={15} /></button><span className={styles.divider} />
      <button type="button" aria-label="Add text" title="Add text" disabled={interacting || page.elements.length >= DESIGN_LIMITS.elementsPerPage} onClick={insertText}><Type size={17} /></button>
      <button type="button" aria-label="Add shape" title="Add shape" disabled={interacting || page.elements.length >= DESIGN_LIMITS.elementsPerPage} onClick={() => insertShape()}><Shapes size={17} /></button>
      <button type="button" aria-label="Present demo" title="Present" disabled={interacting} onClick={() => { setEditingId(null); setPresenting(true) }}><Play size={15} /></button>
      <button type="button" aria-label="Reset demo" title="Reset demo" data-action="reset" disabled={!state.history.canUndo || interacting} onClick={() => { setEditingId(null); setPanel(null); api.update(() => ({ doc: initial, page: 0, select: [] })); notify("Fresh start. Undo brings your edits back.") }}><RotateCcw size={15} /></button>
    </div>
    <div className={styles.context} data-keep-editing="true">{selection.length ? <ContextToolbar api={localApi} selection={selection} actions={actions} cropping={false} /> : <div className={styles.pageTools} role="toolbar" aria-label="Page tools"><span className={styles.contextLabel}>Page</span><div className={styles.swatches} role="group" aria-label="Try a canvas color">{demoPageColors.map(({ name, value }) => <button key={name} type="button" aria-label={name} title={name} aria-pressed={page.background === value} onClick={() => changePageColor(value)}><span style={{ background: value }}>{page.background === value && <Check size={13} />}</span></button>)}</div><label className={styles.color} title="Page color"><span style={{ background: page.background }} /><input type="color" aria-label="Page color" value={page.background} onChange={event => changePageColor(event.target.value)} /></label><button type="button" aria-label="Page styles" title="Styles" aria-pressed={panel === "styles"} onClick={() => togglePanel("styles")}><Palette size={16} /></button></div>}</div>
    <div className={styles.canvasWorkspace}>
      <div className={styles.rail} role="toolbar" aria-label="Design library"><button type="button" aria-label="Text styles" title="Text styles" aria-pressed={panel === "text"} onClick={() => togglePanel("text")}><Type size={19} /><span>Text</span></button><button type="button" aria-label="Elements library" title="Elements" aria-pressed={panel === "elements"} onClick={() => togglePanel("elements")}><Shapes size={19} /><span>Elements</span></button><button type="button" aria-label="Design styles" title="Styles" aria-pressed={panel === "styles"} onClick={() => togglePanel("styles")}><Palette size={19} /><span>Styles</span></button><button type="button" aria-label="Layers library" title="Layers" aria-pressed={panel === "layers"} onClick={() => togglePanel("layers")}><Layers size={19} /><span>Layers</span></button></div>
      <div ref={stageArea} className={styles.stageArea}><DesignStage api={localApi} zoom={zoom} snap grid={false} editingId={editingId} cropping={false} onEdit={setEditingId} onUndo={travelHistory} onInteraction={setInteracting} onContext={() => {}} /></div>
      {panel && <div className={styles.library} role="region" aria-label={`${PANEL_LABELS[panel] ?? "Design"} library`} data-keep-editing="true"><div className={styles.libraryHeading}><strong>{PANEL_LABELS[panel]}</strong><button type="button" aria-label="Close design library" onClick={() => setPanel(null)}><X size={15} /></button></div><div className={styles.libraryContents}>
        {panel === "text" && <TextPanel api={localApi} />}{panel === "layers" && <LayersPanel api={localApi} />}{panel === "styles" && <StylesPanel api={localApi} />}{(panel === "text-color" || panel === "text-effects") && <SelectionPanel api={localApi} effects={panel === "text-effects"} />}
        {panel === "elements" && <div className={styles.shapeGrid}>{DEMO_SHAPES.map((kind, index) => <button type="button" key={kind} aria-label={`Insert ${SHAPE_LABELS[kind].toLowerCase()}`} title={SHAPE_LABELS[kind]} disabled={page.elements.length >= DESIGN_LIMITS.elementsPerPage} onClick={() => insertShape(kind)}><svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true"><path d={shapePath(kind, 38, 38)} transform="translate(4 4)" fill={["#8b7dce", "#e7987d", "#629783"][index % 3]} /></svg></button>)}</div>}
      </div></div>}
    </div>
    <div className={styles.pages}><PagesStrip design={api.design} pageIndex={api.pageIndex} measure={measure} onSelect={goToPage} onAdd={addDemoPage} onDuplicate={index => { setEditingId(null); api.update(doc => { const result = duplicatePage(doc, index); return { doc: result.doc, page: result.index, select: [] } }) }} onRemove={index => { setEditingId(null); api.update(doc => { const result = removePage(doc, index); return { doc: result.doc, page: result.index, select: [] } }) }} onMove={(from, to) => { setEditingId(null); api.update(doc => ({ doc: movePage(doc, from, to), page: to, select: [] })) }} onToggleHidden={index => api.update(doc => updatePage(doc, index, { hidden: !doc.pages[index].hidden }))} /></div>
    <div className={styles.footer}><div className={styles.pageStatus}><span className={styles.pageNumber} aria-label={`Current page ${api.pageIndex + 1} of ${api.design.pages.length}`}>{api.pageIndex + 1} / {api.design.pages.length}</span><button type="button" aria-label="Page notes" title="Page notes" aria-pressed={notesOpen} onClick={() => setNotesOpen(open => !open)}><NotebookPen size={15} /></button><select className={styles.layers} aria-label="Select layer" value={selected?.id ?? ""} onChange={event => { setEditingId(null); api.select(event.target.value ? [event.target.value] : []) }}><option value="">Page</option>{page.elements.map(element => <option key={element.id} value={element.id}>{layerLabel(element)}</option>)}</select></div><div className={styles.footerActions}><button type="button" aria-label="Download demo image" title="Download this page as PNG" disabled={downloading || interacting} onClick={() => void download()}><Download size={16} /></button><Link href="/dashboard" aria-label="Open Studio workspace">Open Studio<ArrowRight size={13} /></Link></div></div>
    {notesOpen && <div className={styles.pageNotes}><textarea aria-label="Demo page notes" placeholder="Your page notes…" maxLength={DESIGN_LIMITS.notesLength} value={page.notes} onChange={event => api.update(doc => updatePage(doc, api.pageIndex, { notes: event.target.value }), { coalesce: `demo-notes:${page.id}` })} /></div>}
    <p className={styles.hint}>Local demo · Download to keep it.</p>
    {presenting && <PresentMode design={api.design} startIndex={api.pageIndex} measure={measure} onClose={index => { api.goToPage(index); setPresenting(false) }} />}
  </div>
}

"use client"

import { useCallback, useRef, useState } from "react"
import { distributeElements, groupElements, moveElements, removeElements, ungroupElements, type CanvasDoc, type CanvasElement } from "@/lib/studio/canvas-engine"
import { pageCanvas, withPageCanvas, type DesignDoc } from "@/lib/design/document"
import { alignSelection, copyElements, duplicateSelection, pasteElements, pictureElement } from "@/lib/design/editing"
import { clusteredSelection, commitEditorChange, createEditorState, travelEditorHistory, validPage, type ChangeOptions, type EditorChange, type EditorState } from "@/lib/design/editor-state"
import { insertDesignElements } from "@/lib/design/editor-insert"
import { reorderSelection } from "@/lib/design/gestures"
import { designTheme } from "@/lib/design/themes"
import type { MeasureText } from "@/lib/design/text"
import type { Note } from "../types"
import type { DesignEditorApi, InsertOptions, UploadedPicture } from "./editor-types"
import type { ToolbarActions } from "./context-toolbar"
import { isPictureFile, uploadPicture } from "./image-upload"

interface ControllerOptions { initial: DesignDoc; notes: readonly Note[]; measure: MeasureText; notify: (message: string) => void }

export function useDesignController({ initial, notes, measure, notify }: ControllerOptions) {
  const [state, renderState] = useState(() => createEditorState(initial))
  const current = useRef(state)
  const clipboard = useRef<CanvasElement[]>([])
  const [recentUploads, setRecentUploads] = useState<UploadedPicture[]>([])
  const publish = useCallback((next: EditorState) => { current.current = next; renderState(next) }, [])
  const update = useCallback((change: (doc: DesignDoc) => DesignDoc | EditorChange, options: ChangeOptions = {}) => {
    publish(commitEditorChange(current.current, change, options))
  }, [publish])
  const select = useCallback((ids: string[]) => {
    const state = current.current
    publish({ ...state, selected: clusteredSelection(state.history.present, state.page, ids), coalescing: null })
  }, [publish])
  const goToPage = useCallback((index: number) => {
    const state = current.current
    publish({ ...state, page: validPage(state.history.present, index), selected: [], coalescing: null })
  }, [publish])
  const insertElements = useCallback((elements: CanvasElement[], options: InsertOptions = {}) => {
    const page = options.page ?? current.current.page
    update((doc) => insertDesignElements(doc, elements, { page, at: options.at }))
  }, [update])
  const uploadFiles = useCallback(async (files: File[], options: InsertOptions = {}) => {
    const pageId = current.current.history.present.pages[options.page ?? current.current.page]?.id
    const pictures = files.filter(isPictureFile)
    if (!pictures.length) { notify("Choose a PNG, JPEG, WebP, GIF or SVG picture."); return }
    notify("Uploading pictures…")
    const uploaded: UploadedPicture[] = []
    for (const file of pictures) {
      try { uploaded.push(await uploadPicture(file)) }
      catch (error) { notify(error instanceof Error ? error.message : "A picture could not be uploaded.") }
    }
    if (!uploaded.length) return
    setRecentUploads((current) => [...uploaded, ...current])
    const doc = current.current.history.present
    const page = doc.pages.findIndex((candidate) => candidate.id === pageId)
    if (page < 0) { notify("Pictures uploaded. The original page was removed; find them in Uploads."); return }
    insertElements(uploaded.map((picture) => pictureElement(picture.src, picture.width && picture.height ? { width: picture.width, height: picture.height } : null, doc)), { ...options, page })
    notify(`${uploaded.length} picture${uploaded.length === 1 ? "" : "s"} added.`)
  }, [insertElements, notify])
  const transform = useCallback((change: (canvas: CanvasDoc, ids: string[]) => CanvasDoc, coalesce?: string) => {
    const { page, selected } = current.current
    update((doc) => withPageCanvas(doc, page, change(pageCanvas(doc, page), selected)), { coalesce })
  }, [update])
  const undo = useCallback((redo = false) => publish(travelEditorHistory(current.current, redo ? "redo" : "undo")), [publish])
  const remove = () => transform((canvas, ids) => removeElements(canvas, ids.filter((id) => !canvas.elements.find((element) => element.id === id)?.locked)))
  const duplicate = () => {
    const { page, selected } = current.current
    update((doc) => { const result = duplicateSelection(pageCanvas(doc, page), selected, 24); return { doc: withPageCanvas(doc, page, result.canvas), select: result.ids } })
  }
  const copy = () => { const state = current.current; clipboard.current = copyElements(pageCanvas(state.history.present, state.page), state.selected); notify("Selection copied. Paste it on any page in this design.") }
  const paste = () => {
    const { page } = current.current
    update((doc) => { const result = pasteElements(pageCanvas(doc, page), clipboard.current, 24); return { doc: withPageCanvas(doc, page, result.canvas), select: result.ids } })
  }
  const commands: Pick<ToolbarActions, "remove" | "duplicate" | "group" | "ungroup" | "reorder" | "align" | "distribute" | "toggleLock"> = {
    remove, duplicate,
    group: () => transform((canvas, ids) => groupElements(canvas, ids)),
    ungroup: () => transform((canvas, ids) => ids.reduce((next, id) => ungroupElements(next, id), canvas)),
    reorder: (action) => transform((canvas, ids) => reorderSelection(canvas, ids, action)),
    align: (mode) => transform((canvas, ids) => alignSelection(canvas, ids, mode)),
    distribute: (axis) => transform((canvas, ids) => distributeElements(canvas, ids, axis)),
    toggleLock: () => transform((canvas, ids) => { const lock = !canvas.elements.filter((element) => ids.includes(element.id)).every((element) => element.locked); return { ...canvas, elements: canvas.elements.map((element) => ids.includes(element.id) ? { ...element, locked: lock } : element) } }),
  }
  const api: DesignEditorApi = { design: state.history.present, pageIndex: state.page, theme: designTheme(state.history.present.theme), measure, notes, selectedIds: state.selected, update, select, goToPage, notify, insertElements, uploadFiles, recentUploads }
  return { api, state, current, commands, undo, copy, paste, nudge: (dx: number, dy: number) => transform((canvas, ids) => moveElements(canvas, ids, dx, dy), "nudge") }
}

import { canvasDeepEqual, createHistory, selectionCluster, type History } from "../studio/canvas-engine"
import { pageCanvas, type DesignDoc } from "./document"
import { firstChangedPage } from "./gestures"

export interface EditorState {
  history: History<DesignDoc>
  page: number
  selected: string[]
  coalescing: { key: string; time: number; base: History<DesignDoc> } | null
}

export interface EditorChange { doc: DesignDoc; page?: number; select?: string[] }
export interface ChangeOptions { page?: number; select?: string[]; coalesce?: string }

export function createEditorState(doc: DesignDoc): EditorState {
  return { history: createHistory(doc), page: 0, selected: [], coalescing: null }
}

export function validPage(doc: DesignDoc, index: number): number {
  return Math.max(0, Math.min(doc.pages.length - 1, Number.isFinite(index) ? Math.floor(index) : 0))
}

export function clusteredSelection(doc: DesignDoc, page: number, ids: readonly string[]): string[] {
  const canvas = pageCanvas(doc, page)
  return [...new Set(ids.flatMap((id) => selectionCluster(canvas, id)))]
}

/** Synchronous reducer: two commands in one event always see the previous command. */
export function commitEditorChange(state: EditorState, change: (doc: DesignDoc) => DesignDoc | EditorChange, options: ChangeOptions = {}, now = Date.now()): EditorState {
  const result = change(state.history.present)
  const update = "doc" in result ? result : { doc: result }
  const page = validPage(update.doc, options.page ?? update.page ?? state.page)
  const selected = (options.select ?? update.select ?? (page === state.page ? state.selected : [])).filter((id) => update.doc.pages[page].elements.some((element) => element.id === id))
  if (canvasDeepEqual(update.doc, state.history.present)) return { ...state, page, selected }
  const previous = state.coalescing
  const base = options.coalesce && previous?.key === options.coalesce && now - previous.time < 750 ? previous.base : state.history
  return { history: base.commit(update.doc), page, selected, coalescing: options.coalesce ? { key: options.coalesce, time: now, base } : null }
}

export function travelEditorHistory(state: EditorState, direction: "undo" | "redo"): EditorState {
  const history = state.history[direction]()
  if (canvasDeepEqual(history.present, state.history.present)) return state
  const changedPage = firstChangedPage(state.history.present, history.present)
  const page = validPage(history.present, changedPage < 0 ? state.page : changedPage)
  return { history, page, selected: [], coalescing: null }
}

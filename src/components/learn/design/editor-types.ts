import type { CanvasElement } from "@/lib/studio/canvas-engine"
import type { DesignDoc } from "@/lib/design/document"
import type { MeasureText } from "@/lib/design/text"
import type { DesignTheme } from "@/lib/design/themes"

import type { Note } from "../types"

/**
 * What the design editor hands its side panels. Panels never hold a copy of
 * the design: they read the committed one and change it through `update`,
 * which always starts from the newest committed state, so a click that lands
 * right after another edit cannot undo it.
 */

export type DesignPanelId = "templates" | "elements" | "text" | "uploads" | "magic" | "styles" | "layers"

export interface UploadedPicture {
  /** The stored file's id in `/api/files`. */
  id: string
  src: string
  name: string
  width: number | null
  height: number | null
}

export interface InsertOptions {
  /** Page to insert on (default: the current page). */
  page?: number
  /** Where the element's centre lands, in page coordinates (default: centred, stepping off anything already there). */
  at?: { x: number; y: number }
}

/** A change can also say which page to show and what to select afterwards. */
export interface DesignUpdate {
  doc: DesignDoc
  page?: number
  select?: string[]
}

export interface DesignEditorApi {
  /** The committed design: what undo steps are made of. */
  design: DesignDoc
  pageIndex: number
  theme: DesignTheme
  measure: MeasureText
  selectedIds: readonly string[]
  notes: readonly Note[]
  /**
   * One undoable change, computed from the newest committed design. Changes
   * sharing a `coalesce` key within a moment of each other (a slider being
   * dragged, a size stepped with + + +) become one undo step.
   */
  update: (change: (design: DesignDoc) => DesignDoc | DesignUpdate, after?: { page?: number; select?: string[]; coalesce?: string }) => void
  /** Put new elements on a page and select them. */
  insertElements: (elements: CanvasElement[], options?: InsertOptions) => void
  select: (ids: string[]) => void
  goToPage: (index: number) => void
  notify: (message: string) => void
  /** Upload pictures and place them (or fill the frame they were dropped on). */
  uploadFiles: (files: File[], options?: InsertOptions) => Promise<void>
  /** Pictures uploaded while this editor is open, newest first. */
  recentUploads: readonly UploadedPicture[]
}

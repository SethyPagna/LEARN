import { createResourceRoute } from "@/lib/api/resource-route"
import { archiveEditorDocument, listEditorDocuments, restoreEditorDocument, saveEditorDocument } from "@/lib/data"

/**
 * Free-form design canvases.
 *
 * Canvases are stored in `editor_documents` with `document_type = 'canvas'`,
 * so this route is a descriptor over the shared factory — no schema change and
 * no second copy of the archive/restore contract. `content` holds the document
 * in the open format produced by `serializeCanvas` in
 * `src/lib/studio/canvas-engine.ts`.
 */
export const { GET, POST, PUT, DELETE, PATCH } = createResourceRoute({
  name: "canvas",
  list: (user, status) => listEditorDocuments(user, "canvas", status),
  save: (user, body) => saveEditorDocument(user, body, "canvas"),
  archive: archiveEditorDocument,
  restore: restoreEditorDocument,
})

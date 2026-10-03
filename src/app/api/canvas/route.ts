import { createResourceRoute } from "@/lib/api/resource-route"
import { archiveEditorDocument, getEditorDocument, listEditorDocuments, restoreEditorDocument, saveEditorDocument } from "@/lib/data"
import { designPreview } from "@/lib/design/document"

/**
 * Designs (multi-page canvases).
 *
 * Designs are stored in `editor_documents` with `document_type = 'canvas'`,
 * so this route is a descriptor over the shared factory — no schema change and
 * no second copy of the archive/restore contract. `content` holds the design
 * in the format produced by `serializeDesign` in `src/lib/design/document.ts`
 * (older rows hold a one-page canvas, which `normalizeDesignDoc` migrates).
 *
 * `GET ?view=summary` lists covers only (the first visible page and a page
 * count), so the designs home stays light; `GET ?id=` opens one active design.
 * `GET ?id=…&status=all` finds an archived conversion before restoring it,
 * preserving edits made after the original deck was converted.
 */
export const { GET, POST, PUT, DELETE, PATCH } = createResourceRoute({
  name: "canvas",
  list: (user, status) => listEditorDocuments(user, "canvas", status),
  get: (user, id, status) => getEditorDocument(user, id, { documentType: "canvas", status }),
  save: (user, body) => saveEditorDocument(user, body, "canvas"),
  archive: archiveEditorDocument,
  restore: restoreEditorDocument,
  summarize: (row) => {
    const record = row as Record<string, unknown>
    const { preview, pageCount } = designPreview(record.content)
    return { ...record, content: preview, page_count: pageCount }
  },
})

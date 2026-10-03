import { createResourceRoute } from "@/lib/api/resource-route"
import { archiveEditorDocument, listEditorDocuments, restoreEditorDocument, saveEditorDocument } from "@/lib/data"

export const { GET, POST, PUT, DELETE, PATCH } = createResourceRoute({
  name: "document",
  list: (user, status) => listEditorDocuments(user, "doc", status),
  save: (user, body) => saveEditorDocument(user, body, "doc"),
  archive: archiveEditorDocument,
  restore: restoreEditorDocument,
})

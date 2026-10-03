import { createResourceRoute } from "@/lib/api/resource-route"
import { archiveSheet, listSheets, restoreSheet, saveSheet } from "@/lib/data"

export const { GET, POST, PUT, DELETE, PATCH } = createResourceRoute({
  name: "sheet",
  list: listSheets,
  save: saveSheet,
  archive: archiveSheet,
  restore: restoreSheet,
})

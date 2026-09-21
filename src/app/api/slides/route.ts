import { createResourceRoute } from "@/lib/api/resource-route"
import { archiveSlideDeck, listSlideDecks, restoreSlideDeck, saveSlideDeck } from "@/lib/data"

export const { GET, POST, PUT, DELETE, PATCH } = createResourceRoute({
  name: "slide",
  list: listSlideDecks,
  save: saveSlideDeck,
  archive: archiveSlideDeck,
  restore: restoreSlideDeck,
})

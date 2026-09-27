"use client"

import { CONTENT_IMPORT_MAX_BYTES } from "@/lib/export/pptx-import"
import { api } from "../api"
import { uploadPicture } from "./image-upload"

/**
 * A PowerPoint file becomes a slides design: the layout is kept (see
 * `lib/design/from-pptx.ts`), pictures are uploaded to the person's files like
 * any picture added in the editor, and the design is saved before it opens.
 * What could not come across is kept for the editor to say once it opens.
 */

export const PPTX_ACCEPT = ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
const NOTES_KEY = "learn:pptx-import-notes"

export async function importPowerPoint(file: File, onStatus: (status: string) => void = () => {}): Promise<string> {
  if (!/\.pptx$/i.test(file.name)) throw new Error("Choose a PowerPoint file (.pptx).")
  if (file.size > CONTENT_IMPORT_MAX_BYTES) throw new Error("Choose a file smaller than 25 MB.")
  onStatus("Reading slides…")
  const { importPptxDesign } = await import("@/lib/design/from-pptx")
  const { design, warnings } = await importPptxDesign(new Uint8Array(await file.arrayBuffer()), {
    fallbackTitle: file.name.replace(/\.pptx$/i, "").trim(),
    placePicture: async (picture) => (await uploadPicture(new File([picture.bytes as BlobPart], picture.name, { type: picture.type }))).src,
    onProgress: ({ done, total }) => { if (total) onStatus(`Adding pictures: ${done} of ${total}`) },
  })
  onStatus("Saving…")
  const { item } = await api<{ item: { id: string } }>("/api/canvas", { method: "POST", body: JSON.stringify({ id: design.id, title: design.name, content: design }) })
  const id = item?.id || design.id
  try { sessionStorage.setItem(NOTES_KEY, JSON.stringify({ id, warnings })) } catch { /* the notice just says less */ }
  return `/slides?design=${encodeURIComponent(id)}&from=pptx`
}

/**
 * The notice for a design that was just imported. It is only asked for while
 * the address says `from=pptx`, which the editor clears once the design opens;
 * the note is left in place so a remount (React's dev double run) reads it too.
 */
export function importNotice(id: string): string {
  let warnings: string[] = []
  try {
    const stored = JSON.parse(sessionStorage.getItem(NOTES_KEY) || "null") as { id?: string; warnings?: unknown } | null
    if (stored?.id === id && Array.isArray(stored.warnings)) warnings = stored.warnings.filter((warning): warning is string => typeof warning === "string")
  } catch { /* storage unavailable */ }
  return ["Imported from PowerPoint.", ...warnings].join(" ")
}

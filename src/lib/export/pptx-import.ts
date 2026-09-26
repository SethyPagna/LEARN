import type { WorkspaceDeck } from "@/components/learn/types"
import { readZip, normalizePartNames } from "@/lib/export/zip"
import { attribute, childNamed, childrenNamed, decodeXmlBytes, descendants, findFirst, parseXml, textWithBreaks, type XmlElement } from "@/lib/export/xml-read"

export const CONTENT_IMPORT_MAX_BYTES = 25 * 1024 * 1024
const MAX_SLIDES = 100
const MAX_TEXT = 1_000_000

export interface ImportedPresentation {
  title: string
  slides: WorkspaceDeck["slides"]
  warnings: string[]
}

export async function importPptx(bytes: Uint8Array): Promise<ImportedPresentation> {
  const parts = normalizePartNames(await readZip(bytes, { maxArchiveBytes: CONTENT_IMPORT_MAX_BYTES, maxEntries: 5000, maxEntryBytes: 20 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024 }))
  const xml = (path: string) => {
    if (!parts[path]) throw new Error(`PPTX is missing ${path}.`)
    return parseXml(decodeXmlBytes(parts[path]), path, { preserveQualifiedAttributes: true, maxDepth: 40, maxNodes: 100_000 })
  }
  const relations = (owner: string) => {
    const path = relationshipPath(owner)
    return parts[path] ? childrenNamed(xml(path), "Relationship") : []
  }
  const root = relations("").find((rel) => attribute(rel, "Type").endsWith("/officeDocument"))
  const presentationPath = root ? resolveRelationship("", root) : "ppt/presentation.xml"
  const presentation = xml(presentationPath)
  const order = childNamed(presentation, "sldIdLst")
  const slideIds = order ? childrenNamed(order, "sldId") : []
  if (!slideIds.length) throw new Error("PPTX has no slides in its presentation order.")
  if (slideIds.length > MAX_SLIDES) throw new Error(`Import supports at most ${MAX_SLIDES} slides.`)
  const slideRelations = relations(presentationPath)
  let totalText = 0
  const slides = slideIds.map((slideId, index) => {
    // Numeric `id` is unrelated to the namespaced relationship id (prefixes vary).
    const relationshipId = Object.entries(slideId.attributes).find(([key]) => key.endsWith(":id"))?.[1]
    const relation = slideRelations.find((rel) => attribute(rel, "Id") === relationshipId && attribute(rel, "Type").endsWith("/slide"))
    if (!relation) throw new Error(`PPTX slide ${index + 1} has no valid slide relationship.`)
    const slidePath = resolveRelationship(presentationPath, relation)
    const slide = xml(slidePath)
    const shapes = descendants(slide, "sp")
    const titleShape = shapes.find((shape) => ["title", "ctrTitle"].includes(attribute(findFirst(shape, "ph"), "type")))
    const title = titleShape ? paragraphText(titleShape) : `Slide ${index + 1}`
    const titleParagraphs = new Set(titleShape ? descendants(titleShape, "p") : [])
    const content = descendants(slide, "p").filter((paragraph) => !titleParagraphs.has(paragraph))
    const body = content.map((paragraph) => textWithBreaks(paragraph).trim()).filter(Boolean).join("\n")
    const noteRelation = relations(slidePath).find((rel) => attribute(rel, "Type").endsWith("/notesSlide"))
    let speakerNotes = ""
    if (noteRelation) {
      const notes = xml(resolveRelationship(slidePath, noteRelation))
      speakerNotes = descendants(notes, "sp")
        .filter((shape) => !["sldImg", "sldNum", "dt", "hdr", "ftr"].includes(attribute(findFirst(shape, "ph"), "type")))
        .map(paragraphText).filter(Boolean).join("\n")
    }
    totalText += title.length + body.length + speakerNotes.length
    if (totalText > MAX_TEXT || body.length > 50_000 || speakerNotes.length > 50_000) throw new Error("PPTX text exceeds the import limit.")
    return { title, body, speakerNotes, hidden: attribute(slide, "show") === "0", layout: "title" as const }
  })
  const title = parts["docProps/core.xml"] ? textWithBreaks(findFirst(xml("docProps/core.xml"), "title") ?? { name: "title", attributes: {}, children: [] }) : ""
  return { title, slides, warnings: ["Imported editable slide text and speaker notes. Layout, images, charts, animations, and theme styling are not preserved."] }
}

function paragraphText(shape: XmlElement): string {
  return descendants(shape, "p").map((paragraph) => textWithBreaks(paragraph).trim()).filter(Boolean).join("\n")
}

function relationshipPath(owner: string): string {
  const slash = owner.lastIndexOf("/")
  return `${owner.slice(0, slash + 1)}_rels/${owner.slice(slash + 1)}.rels`
}

function resolveRelationship(owner: string, relation: XmlElement): string {
  let target: string
  try { target = decodeURIComponent(attribute(relation, "Target")) }
  catch { throw new Error("PPTX contains an invalid content relationship.") }
  if (attribute(relation, "TargetMode") === "External" || !target || /[\\?#:\u0000]/u.test(target)) throw new Error("PPTX contains an unsupported external or invalid content relationship.")
  const segments = target.startsWith("/") ? [] : owner.split("/").slice(0, -1)
  for (const segment of target.split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (!segments.length) throw new Error("PPTX relationship escapes the package.")
      segments.pop()
    } else segments.push(segment)
  }
  return segments.join("/")
}

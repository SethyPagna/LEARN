import { NextResponse } from "next/server"
import { readJsonObject } from "@/lib/api"
import { getCurrentUser, saveEditorDocument, saveNote, saveSheet, saveSlideDeck } from "@/lib/data"
import { importTargetOptions, shapeImportedLearningContent, type ImportTargetSelection } from "@/lib/import-gateway"

function normalizeImportTarget(value: unknown): ImportTargetSelection {
  const target = String(value || "auto").trim()
  return importTargetOptions.includes(target as ImportTargetSelection) ? target as ImportTargetSelection : "auto"
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await readJsonObject(request)
  const text = String(body.text || "").trim()
  if (!text) return NextResponse.json({ error: "Provide text to import." }, { status: 400 })

  const shaped = shapeImportedLearningContent({
    raw: text,
    title: body.title ? String(body.title) : undefined,
    target: normalizeImportTarget(body.target),
  })

  if (shaped.target === "doc") {
    const item = await saveEditorDocument(user, shaped.payload, "doc")
    return NextResponse.json({ target: shaped.target, item }, { status: 201 })
  }

  if (shaped.target === "sheet") {
    const item = await saveSheet(user, shaped.payload)
    return NextResponse.json({ target: shaped.target, item }, { status: 201 })
  }

  if (shaped.target === "slides") {
    const item = await saveSlideDeck(user, shaped.payload)
    return NextResponse.json({ target: shaped.target, item }, { status: 201 })
  }

  const notePayload = shaped.payload as {
    title: string
    content: string
    icon?: string
    favorite?: boolean
    template?: string
  }
  const note = await saveNote(user, notePayload)
  return NextResponse.json({ target: shaped.target, note, item: note }, { status: 201 })
}

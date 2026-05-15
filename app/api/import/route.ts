import { NextResponse } from "next/server"
import { getCurrentUser, saveEditorDocument, saveNote, saveSheet, saveSlideDeck } from "@/lib/data"
import { shapeImportedLearningContent, type ImportTarget } from "@/lib/import-gateway"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null) as { text?: string; title?: string; target?: ImportTarget | "auto" } | null
  const text = body?.text?.trim()
  if (!text) return NextResponse.json({ error: "Provide text to import." }, { status: 400 })

  const shaped = shapeImportedLearningContent({ raw: text, title: body?.title, target: body?.target || "auto" })

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

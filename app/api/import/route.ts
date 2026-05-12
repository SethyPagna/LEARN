import { NextResponse } from "next/server"
import { getCurrentUser, saveNote } from "@/lib/data"
import { getPromptTemplate } from "@/lib/ai/prompt-library"

function shapeImportedContent(raw: string) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const title = lines.find((line) => line.length > 8)?.slice(0, 72) || "Imported Learning Capture"
  return {
    title,
    content: [
      "## Capture",
      raw.trim(),
      "",
      "## Study Design",
      "- Key ideas:",
      "- Questions to practice:",
      "- Terms to remember:",
      "",
      "## AI Prompt Used",
      getPromptTemplate("note_design")?.title || "Content design pass",
    ].join("\n"),
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null) as { text?: string; title?: string } | null
  const text = body?.text?.trim()
  if (!text) return NextResponse.json({ error: "Provide text to import." }, { status: 400 })

  const shaped = shapeImportedContent(text)
  const note = await saveNote(user, {
    title: body?.title?.trim() || shaped.title,
    content: shaped.content,
    icon: "Sparkles",
    favorite: true,
    template: "ai-capture",
  })

  return NextResponse.json({ note }, { status: 201 })
}

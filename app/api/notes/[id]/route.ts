import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { deleteNote, getNote, saveNote } from "@/lib/data"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const { id } = await context.params
  const item = await getNote(id)
  if (!item) return fail("Note not found.", 404)
  return ok({ item })
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const { id } = await context.params
  const body = await request.json().catch(() => ({}))
  const item = await saveNote(user, {
    id,
    title: String(body.title || "Untitled"),
    content: String(body.content || ""),
    icon: String(body.icon || "FileText"),
    favorite: Boolean(body.favorite),
    template: String(body.template || "blank"),
  })
  return ok({ item })
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const { id } = await context.params
  await deleteNote(user, id)
  return ok({ success: true })
}

import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser } from "@/lib/api"
import { listNotes, normalizeArchiveStatus, saveNote } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const status = normalizeArchiveStatus(new URL(request.url).searchParams.get("status"))
  return ok({ items: await listNotes(status) })
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const body = await readJsonObject(request)
  if (!String(body.title || "").trim()) return fail("Note title is required.")
  const item = await saveNote(user, {
    title: String(body.title || ""),
    content: String(body.content || ""),
    icon: String(body.icon || "FileText"),
    favorite: Boolean(body.favorite),
    template: String(body.template || "blank"),
  })
  return ok({ item })
}

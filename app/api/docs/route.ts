import type { NextRequest } from "next/server"
import { isApiResponse, ok, requireApiUser } from "@/lib/api"
import { archiveEditorDocument, listEditorDocuments, normalizeArchiveStatus, restoreEditorDocument, saveEditorDocument } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const status = normalizeArchiveStatus(new URL(request.url).searchParams.get("status"))
  return ok({ items: await listEditorDocuments(user, "doc", status) })
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  return ok({ item: await saveEditorDocument(user, body, "doc") }, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  return ok({ item: await saveEditorDocument(user, body, "doc") })
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  await archiveEditorDocument(user, new URL(request.url).searchParams.get("id") || "")
  return ok({ success: true })
}

export async function PATCH(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  if (body.action === "restore") {
    return ok({ item: await restoreEditorDocument(user, String(body.id || "")) })
  }
  return ok({ success: false }, { status: 400 })
}

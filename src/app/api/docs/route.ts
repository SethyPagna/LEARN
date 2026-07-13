import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { archiveEditorDocument, listEditorDocuments, normalizeArchiveStatus, restoreEditorDocument, saveEditorDocument } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const status = normalizeArchiveStatus(new URL(request.url).searchParams.get("status"))
  return ok({ items: await listEditorDocuments(user, "doc", status) })
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  return ok({ item: await saveEditorDocument(user, body, "doc") }, { status: 201 })
})

export const PUT = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  return ok({ item: await saveEditorDocument(user, body, "doc") })
})

export const DELETE = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  await archiveEditorDocument(user, new URL(request.url).searchParams.get("id") || "")
  return ok({ success: true })
})

export const PATCH = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  if (body.action === "restore") {
    return ok({ item: await restoreEditorDocument(user, String(body.id || "")) })
  }
  return fail("Unsupported document action.", 400)
})

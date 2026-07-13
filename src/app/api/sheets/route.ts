import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { archiveSheet, listSheets, normalizeArchiveStatus, restoreSheet, saveSheet } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const status = normalizeArchiveStatus(new URL(request.url).searchParams.get("status"))
  return ok({ items: await listSheets(user, status) })
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  return ok({ item: await saveSheet(user, body) }, { status: 201 })
})

export const PUT = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  return ok({ item: await saveSheet(user, body) })
})

export const DELETE = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  await archiveSheet(user, new URL(request.url).searchParams.get("id") || "")
  return ok({ success: true })
})

export const PATCH = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  if (body.action === "restore") {
    return ok({ item: await restoreSheet(user, String(body.id || "")) })
  }
  return fail("Unsupported sheet action.", 400)
})

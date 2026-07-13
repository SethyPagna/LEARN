import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { deleteUserConnection, listUserConnections, upsertUserConnection } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  try {
    return ok({ items: await listUserConnections(user) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to load connections.", 500)
  }
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  try {
    return ok({ item: await upsertUserConnection(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to save connection.", 400)
  }
})

export const DELETE = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  try {
    await deleteUserConnection(user, body)
    return ok({ ok: true })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to remove connection.", 400)
  }
})

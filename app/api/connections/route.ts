import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { deleteUserConnection, listUserConnections, upsertUserConnection } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  try {
    return ok({ items: await listUserConnections(user) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to load connections.", 500)
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  try {
    return ok({ item: await upsertUserConnection(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to save connection.", 400)
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  try {
    await deleteUserConnection(user, body)
    return ok({ ok: true })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to remove connection.", 400)
  }
}

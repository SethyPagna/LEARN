import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { deleteStudyRoom, listStudyRooms, saveStudyRoom } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  try {
    return ok({ items: await listStudyRooms(user) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load study rooms.", 500)
  }
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)

  try {
    return ok({ item: await saveStudyRoom(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to save study room.", 500)
  }
})

export const PUT = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)

  try {
    return ok({ item: await saveStudyRoom(user, body) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to update study room.", 500)
  }
})

export const DELETE = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const id = request.nextUrl.searchParams.get("id") || ""
  if (!id) return fail("Study room id is required.")

  try {
    await deleteStudyRoom(user, id)
    return ok({ deleted: true })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to delete study room.", 500)
  }
})

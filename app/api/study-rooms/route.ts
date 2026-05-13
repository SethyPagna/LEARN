import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { deleteStudyRoom, listStudyRooms, saveStudyRoom } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  try {
    return ok({ items: await listStudyRooms(user) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load study rooms.", 500)
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))

  try {
    return ok({ item: await saveStudyRoom(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to save study room.", 500)
  }
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))

  try {
    return ok({ item: await saveStudyRoom(user, body) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to update study room.", 500)
  }
}

export async function DELETE(request: NextRequest) {
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
}

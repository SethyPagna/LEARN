import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { deleteLearningSpace, listLearningSpaces, saveLearningSpace } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  try {
    return ok({ items: await listLearningSpaces(user) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load learning spaces.", 500)
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))

  try {
    return ok({ item: await saveLearningSpace(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to save learning space.", 500)
  }
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))

  try {
    return ok({ item: await saveLearningSpace(user, body) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to update learning space.", 500)
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const id = request.nextUrl.searchParams.get("id") || ""
  if (!id) return fail("Learning space id is required.")

  try {
    await deleteLearningSpace(user, id)
    return ok({ deleted: true })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to delete learning space.", 500)
  }
}

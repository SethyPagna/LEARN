import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser } from "@/lib/api"
import { deleteLearningSpace, listLearningSpaces, saveLearningSpace } from "@/lib/data"
import { learningGroupApiMessages } from "@/lib/social-api-messages"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  try {
    return ok({ items: await listLearningSpaces(user) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : learningGroupApiMessages.loadFailed, 500)
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)

  try {
    return ok({ item: await saveLearningSpace(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : learningGroupApiMessages.saveFailed, 500)
  }
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)

  try {
    return ok({ item: await saveLearningSpace(user, body) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : learningGroupApiMessages.updateFailed, 500)
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const id = request.nextUrl.searchParams.get("id") || ""
  if (!id) return fail(learningGroupApiMessages.deleteMissingId)

  try {
    await deleteLearningSpace(user, id)
    return ok({ deleted: true })
  } catch (error) {
    return fail(error instanceof Error ? error.message : learningGroupApiMessages.deleteFailed, 500)
  }
}

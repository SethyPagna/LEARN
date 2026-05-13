import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { listStudyBattles, saveStudyBattle } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  try {
    return ok({ items: await listStudyBattles(user) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load study battles.", 500)
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))

  try {
    return ok({ item: await saveStudyBattle(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to save study battle.", 500)
  }
}

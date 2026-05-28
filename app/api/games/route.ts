import type { NextRequest } from "next/server"
import { isApiResponse, ok, readJsonObject, requireApiUser } from "@/lib/api"
import { listGameAttempts, recordGameAttempt } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok({ items: await listGameAttempts(user) })
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  return ok({ item: await recordGameAttempt(user, body) }, { status: 201 })
}

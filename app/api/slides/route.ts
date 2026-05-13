import type { NextRequest } from "next/server"
import { isApiResponse, ok, requireApiUser } from "@/lib/api"
import { archiveSlideDeck, listSlideDecks, saveSlideDeck } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok({ items: await listSlideDecks(user) })
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  return ok({ item: await saveSlideDeck(user, body) }, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  return ok({ item: await saveSlideDeck(user, body) })
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  await archiveSlideDeck(user, new URL(request.url).searchParams.get("id") || "")
  return ok({ success: true })
}

import type { NextRequest } from "next/server"
import { isApiResponse, ok, requireApiUser } from "@/lib/api"
import { archiveSlideDeck, listSlideDecks, normalizeArchiveStatus, restoreSlideDeck, saveSlideDeck } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const status = normalizeArchiveStatus(new URL(request.url).searchParams.get("status"))
  return ok({ items: await listSlideDecks(user, status) })
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

export async function PATCH(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  if (body.action === "restore") {
    return ok({ item: await restoreSlideDeck(user, String(body.id || "")) })
  }
  return ok({ success: false }, { status: 400 })
}

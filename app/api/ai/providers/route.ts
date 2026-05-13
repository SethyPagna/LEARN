import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { listProviderMetadata, listProviderPresets } from "@/lib/ai/providers"
import { deleteAiProviderConfig, getAiProviderAdminState, saveAiProviderConfig, testAiProviderConfig } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  if (user.role !== "admin") return fail("Admin access required.", 403)
  const state = await getAiProviderAdminState()
  return ok({
    ...state,
    catalog: listProviderMetadata(),
    presets: listProviderPresets(),
  })
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  try {
    if (body.action === "test" && body.id) return ok(await testAiProviderConfig(user, String(body.id)))
    return ok({ item: await saveAiProviderConfig(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to save AI provider.", user.role === "admin" ? 400 : 403)
  }
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  try {
    return ok({ item: await saveAiProviderConfig(user, body) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to update AI provider.", user.role === "admin" ? 400 : 403)
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  try {
    await deleteAiProviderConfig(user, new URL(request.url).searchParams.get("id") || "")
    return ok({ success: true })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to delete AI provider.", user.role === "admin" ? 400 : 403)
  }
}

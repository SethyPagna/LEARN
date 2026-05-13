import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { createWorkspaceInvite } from "@/lib/data"

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  try {
    return ok({ item: await createWorkspaceInvite(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to create invite.", 403)
  }
}

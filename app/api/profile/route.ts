import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { updateProfile } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok({ user })
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  const updated = await updateProfile(user, {
    name: String(body.name || user.name),
    email: String(body.email || user.email),
    avatarUrl: String(body.avatarUrl ?? user.avatarUrl ?? ""),
    bio: String(body.bio ?? user.bio ?? ""),
    profileVisibility: String(body.profileVisibility ?? user.profileVisibility ?? "private"),
    preferences: typeof body.preferences === "object" && body.preferences ? body.preferences : {},
  })
  if (!updated) return fail("Profile updated, but the session could not be refreshed.", 500)
  return ok({ user: updated })
}

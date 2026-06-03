import type { NextRequest } from "next/server"
import { fail, ok } from "@/lib/api"
import { getPublicProfile } from "@/lib/data"

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username") || "admin"
  const viewer = request.nextUrl.searchParams.get("viewer") === "connections" ? "connections" : "public"

  try {
    const profile = await getPublicProfile(username, viewer)
    if (!profile) return fail("Profile not found.", 404)
    return ok({ item: profile })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load public profile.", 500)
  }
}

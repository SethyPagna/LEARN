import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { fail, ok } from "@/lib/api"
import { normalizeInviteAcceptance } from "@/lib/auth-entry"
import { acceptWorkspaceInvite, createUserSession, getWorkspaceInviteByToken, SESSION_COOKIE } from "@/lib/data"
import { isDatabaseConfigured } from "@/lib/db"

export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) return fail("Cloudflare D1 is not configured. Invites need the LEARN database.", 503)
  const token = request.nextUrl.searchParams.get("token") || ""
  if (token.trim().length < 8) return fail("Invite link is missing or invalid.", 400)

  const invite = await getWorkspaceInviteByToken(token)
  if (!invite) return fail("Invite not found.", 404)
  return ok({
    invite: {
      email: invite.invited_email,
      expired: invite.expired,
      ready: invite.ready,
      role: invite.role,
      status: invite.status,
    },
  })
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) return fail("Cloudflare D1 is not configured. Invites need the LEARN database.", 503)

  const body = await request.json().catch(() => ({}))
  const validation = normalizeInviteAcceptance(body)
  if (!validation.ok) return fail(validation.error, 400)

  try {
    const accepted = await acceptWorkspaceInvite(validation.value)
    const session = await createUserSession(accepted.user.id)
    const response = NextResponse.json({
      createdUser: accepted.createdUser,
      inviteId: accepted.inviteId,
      user: accepted.user,
    })
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      expires: session.expiresAt,
      path: "/",
    })
    return response
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to accept invite.", 400)
  }
}

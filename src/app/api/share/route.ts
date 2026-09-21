/**
 * Share links for one content item — create, list, revoke.
 *
 * All three are mutations or owner-facing reads, so they all go through
 * `requireApiUser`: that is what applies the cross-origin (CSRF) check to the
 * `POST` and `DELETE`. The public half of this feature is the sibling
 * `[token]` route, which deliberately has no session.
 *
 * The grant model is the one `shared_access` already had: a share link is a
 * `grantee_type = 'public_link'` row whose `grantee_id` is the bearer token, so
 * there is no second table and no token column to add. Only the item's owner (or
 * an admin) can mint, list or revoke one — see `createShareLink`,
 * `listShareLinks` and `revokeShareLink`.
 *
 * Targets are named either by registry id (`contentItemId`) or by the source
 * pair the registry mirrors (`sourceTable` + `sourceId`). The editor knows the
 * record id it just saved, not the registry id, so both forms have to work.
 */

import type { NextRequest } from "next/server"

import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { createShareLink, getContentItemForSource, listShareLinks, revokeShareLink, type ShareLinkRole } from "@/lib/data"

/** The narrowing lives here so an unknown role is refused, never downgraded. */
function readRole(value: unknown): ShareLinkRole | null {
  const role = typeof value === "string" ? value.trim().toLowerCase() : ""
  return role === "viewer" || role === "editor" ? role : null
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const body = await readJsonObject(request)
  // The role is never defaulted: it is the security-relevant part of this
  // request, so an absent or unrecognised value is a client bug worth a 400.
  const role = readRole(body.role)
  if (!role) return fail("A share link can grant view or edit access only.", 400)

  const link = await createShareLink(user, {
    contentItemId: readText(body.contentItemId),
    sourceTable: readText(body.sourceTable),
    sourceId: readText(body.sourceId),
    role,
    expiresAt: body.expiresAt == null ? null : String(body.expiresAt),
  })
  return ok({ link }, { status: 201 })
})

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const params = new URL(request.url).searchParams
  const contentItemId = params.get("contentItemId")?.trim() || ""
  const sourceTable = params.get("sourceTable")?.trim() || ""
  const sourceId = params.get("sourceId")?.trim() || ""

  const target = contentItemId || (await getContentItemForSource(sourceTable, sourceId))?.id
  if (!target) return fail("A content item is required.", 400)

  return ok({ links: await listShareLinks(user, target) })
})

export const DELETE = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const id = new URL(request.url).searchParams.get("id")?.trim() || ""
  if (!id) return fail("A share link id is required.", 400)

  await revokeShareLink(user, id)
  return ok({ success: true })
})

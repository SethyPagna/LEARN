/**
 * GET /api/share/[token] — the public, session-less half of a share link.
 *
 * This is the URL a share link *is*. It has no session and no CSRF origin
 * check, by design: the token in the path is the only credential, and the
 * consumer may well be a browser that has never signed in to LEARN.
 *
 * What keeps that acceptable:
 *   - It exports `GET` only. There is no method here that can change anything,
 *     so a leaked URL grants reads, never writes — an "edit" link's role is
 *     reported and listed, but writing still requires a session and a grant of
 *     its own (see `assertContentWriteRole`).
 *   - One token exposes exactly one content item, resolved by exact match in
 *     SQLite. There is no id in the request that a caller could swap for
 *     somebody else's.
 *   - Every failure — unknown token, revoked row, expired grant, archived item,
 *     dangling content item — answers 404 with no body detail, so a guesser
 *     cannot tell "no such token" from "that token used to exist".
 *   - It is revocable: deleting the `public_link` row (the owner's "Revoke"
 *     control) invalidates every copy of the URL immediately.
 *
 * The payload is the underlying record in the same shape the owning route
 * returns, and it is read-only: nothing here accepts a write.
 */

import type { NextRequest } from "next/server"

import { fail, ok, withApiErrorBoundary } from "@/lib/api"
import { readSharedContentPayload, resolveContentRoleForToken, resolveShareToken } from "@/lib/data"
import { isDatabaseConfigured } from "@/lib/db"

export const GET = withApiErrorBoundary(
  async (_request: NextRequest, context: { params: Promise<{ token: string }> }) => {
    // `requireApiUser` is not usable here — this route exists to answer without
    // a session — but its first check still applies, so it is repeated.
    if (!(await isDatabaseConfigured())) {
      return fail("Cloudflare D1 is not configured. Set LEARN_DB binding or Cloudflare D1 API credentials.", 503)
    }

    const { token } = await context.params
    const resolved = await resolveShareToken(token)

    // One shape for every rejection: a caller that gets 404 learns nothing about
    // whether the token was wrong, expired, revoked, or pointed at an item that
    // has since been archived (a dead link must not keep serving the item).
    if (!resolved || resolveContentRoleForToken(resolved) === "none") {
      return fail("This share link is not valid.", 404)
    }

    const payload = await readSharedContentPayload(resolved.item.source_table, resolved.item.source_id)
    if (!payload) return fail("This share link is not valid.", 404)

    return ok({
      item: {
        id: String(resolved.item.id),
        title: String(resolved.item.title || "Untitled"),
        itemType: String(resolved.item.item_type || ""),
        sourceTable: String(resolved.item.source_table || ""),
        sourceId: String(resolved.item.source_id || ""),
        role: resolved.grant.role,
      },
      payload,
    })
  },
)

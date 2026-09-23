/**
 * The shared archive/CRUD route factory.
 *
 * `docs`, `sheets` and `slides` were three copies of the same five handlers,
 * differing only in which `lib/data.ts` functions they called and the noun in
 * one error message. Every copy had to be edited by hand to fix a status code
 * or add a guard, and the copies had already drifted once.
 *
 * The factory takes the data functions as a descriptor and returns the five
 * handlers. The HTTP contract — status codes, response keys, the `?status=`
 * archive filter, and the `?id=` / `{ action: "restore" }` shapes — lives here
 * once, so the three routes cannot disagree about it.
 *
 * Note that `requireApiUser` now lives *here* rather than in each route file.
 * `src/tests/security/security-hardening.test.ts` is aware of that: it accepts
 * the factory import as a guard for a route, but only because it also asserts
 * that this file still contains the guard. Moving a check into a shared
 * module is only a win if the shared module is itself checked.
 */

import type { NextRequest } from "next/server"

import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { normalizeArchiveStatus, type ArchiveListStatus, type User } from "@/lib/data"

export interface ResourceRouteDescriptor {
  /**
   * The noun used in the `PATCH` rejection message, e.g. "document" gives
   * "Unsupported document action.". Kept per-resource so a caller can still
   * tell the three routes apart from the error alone.
   */
  name: string
  /** List the caller's rows at the requested archive status. */
  list: (user: User, status: ArchiveListStatus) => Promise<unknown[]>
  /** Create or update one row (create when the body carries no id). */
  save: (user: User, body: Record<string, unknown>) => Promise<unknown>
  /** Archive one row by id. */
  archive: (user: User, id: string) => Promise<unknown>
  /** Un-archive one row by id, returning the restored row. */
  restore: (user: User, id: string) => Promise<unknown>
  /**
   * Optional single read: `GET ?id=` answers `{ item }`, or 404 when the row
   * does not exist or the caller may not read it.
   */
  get?: (user: User, id: string) => Promise<unknown | null>
  /**
   * Optional light listing: `GET ?view=summary` passes every row through
   * this, so a picker can show many items without downloading each full body.
   */
  summarize?: (row: unknown) => unknown
}

/**
 * Build the five route handlers for one archive/CRUD resource.
 *
 * Every handler authenticates first and returns the auth failure response
 * unchanged, so a 401/403/503 happens before any body is read or any row is
 * touched. Each is individually wrapped in `withApiErrorBoundary` so a thrown
 * data-layer error still becomes a `{ error }` JSON response.
 */
export function createResourceRoute(descriptor: ResourceRouteDescriptor) {
  const { name, list, save, archive, restore, get, summarize } = descriptor

  const GET = withApiErrorBoundary(async (request: NextRequest) => {
    const user = await requireApiUser(request)
    if (isApiResponse(user)) return user
    const params = new URL(request.url).searchParams
    const id = params.get("id")
    if (get && id !== null) {
      const item = await get(user, id)
      return item ? ok({ item }) : fail(`That ${name} was not found.`, 404)
    }
    const items = await list(user, normalizeArchiveStatus(params.get("status")))
    return ok({ items: summarize && params.get("view") === "summary" ? items.map(summarize) : items })
  })

  const POST = withApiErrorBoundary(async (request: NextRequest) => {
    const user = await requireApiUser(request)
    if (isApiResponse(user)) return user
    const body = await readJsonObject(request)
    return ok({ item: await save(user, body) }, { status: 201 })
  })

  const PUT = withApiErrorBoundary(async (request: NextRequest) => {
    const user = await requireApiUser(request)
    if (isApiResponse(user)) return user
    const body = await readJsonObject(request)
    return ok({ item: await save(user, body) })
  })

  const DELETE = withApiErrorBoundary(async (request: NextRequest) => {
    const user = await requireApiUser(request)
    if (isApiResponse(user)) return user
    await archive(user, new URL(request.url).searchParams.get("id") || "")
    return ok({ success: true })
  })

  const PATCH = withApiErrorBoundary(async (request: NextRequest) => {
    const user = await requireApiUser(request)
    if (isApiResponse(user)) return user
    const body = await readJsonObject(request)
    if (body.action === "restore") {
      return ok({ item: await restore(user, String(body.id || "")) })
    }
    return fail(`Unsupported ${name} action.`, 400)
  })

  return { GET, POST, PUT, DELETE, PATCH }
}

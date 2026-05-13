import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { saveVaultBlock } from "@/lib/data"

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  if (!String(body.noteId || body.note_id || "").trim()) return fail("A note id is required.")

  try {
    return ok({ item: await saveVaultBlock(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to save Vault block.", 500)
  }
}

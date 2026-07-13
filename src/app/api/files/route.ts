import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/data"
import { deleteMediaAsset, listMediaAssets, uploadMediaAsset } from "@/lib/storage"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { withApiErrorBoundary } from "@/lib/api"

export const GET = withApiErrorBoundary(async () => {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return NextResponse.json({ files: await listMediaAssets(user) })
})

export const POST = withApiErrorBoundary(async (request: Request) => {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const limit = await checkRateLimit({
    key: `upload:${user.id}:${getClientIp(request.headers)}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  })
  if (!limit.allowed) return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 })

  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a file using the `file` field." }, { status: 400 })
  }

  const asset = await uploadMediaAsset({
    user,
    file,
    noteId: typeof form.get("noteId") === "string" ? String(form.get("noteId")) : null,
    source: typeof form.get("source") === "string" ? String(form.get("source")).slice(0, 48) : "upload",
  }).catch((error) => {
    const message = error instanceof Error ? error.message : "Upload failed."
    return NextResponse.json({ error: message }, { status: 400 })
  })
  if (asset instanceof NextResponse) return asset

  return NextResponse.json({ file: asset }, { status: 201 })
})

export const DELETE = withApiErrorBoundary(async (request: Request) => {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const id = new URL(request.url).searchParams.get("id") || ""
  if (!id) return NextResponse.json({ error: "File id is required." }, { status: 400 })

  const deleted = await deleteMediaAsset(id, user)
  return NextResponse.json({ deleted })
})

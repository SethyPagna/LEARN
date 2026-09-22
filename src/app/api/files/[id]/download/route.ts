import { NextResponse } from "next/server"
import { getCurrentUser, isFileSharedWithUserViaChat } from "@/lib/data"
import { MAX_INLINE_DOWNLOAD_BYTES } from "@/lib/file-security"
import { getMediaAsset, getMediaAssetById, getMediaObject } from "@/lib/storage"
import { withApiErrorBoundary } from "@/lib/api"

export const GET = withApiErrorBoundary(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  let asset = await getMediaAsset(id, user)
  if (!asset && (await isFileSharedWithUserViaChat(id, user))) {
    asset = await getMediaAssetById(id)
  }
  if (!asset) return NextResponse.json({ error: "File not found" }, { status: 404 })

  // The body is buffered below, so refuse an oversized object before pulling it
  // into memory at all. The recorded size is authoritative for anything this
  // app uploaded; a stale row is caught again once storage reports its own size.
  const sizeLimitError = () =>
    NextResponse.json(
      {
        error:
          "This file is too large to download here. " +
          `Files up to ${MAX_INLINE_DOWNLOAD_BYTES / (1024 * 1024)} MB can be downloaded directly.`,
      },
      { status: 413 },
    )

  if (asset.size_bytes > MAX_INLINE_DOWNLOAD_BYTES) return sizeLimitError()

  const object = await getMediaObject(asset)
  if (!object) return NextResponse.json({ error: "Object not found in R2" }, { status: 404 })

  if (object.size !== null && object.size > MAX_INLINE_DOWNLOAD_BYTES) return sizeLimitError()

  const headers = new Headers()
  headers.set("content-type", asset.content_type)
  headers.set("cache-control", "private, no-store")
  headers.set("content-disposition", `attachment; filename="${asset.filename.replace(/"/g, "")}"`)
  headers.set("x-content-type-options", "nosniff")

  // Bytes, not the storage stream: a raw R2 body cannot be handed to the
  // response in the local runtime and is not worth a second code path for a
  // 25 MB ceiling. See `getMediaObject`.
  const bytes = await object.arrayBuffer()
  return new Response(bytes, { headers })
})

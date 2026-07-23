import { NextResponse } from "next/server"
import { getCurrentUser, isFileSharedWithUserViaChat } from "@/lib/data"
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

  const object = await getMediaObject(asset)
  if (!object?.body) return NextResponse.json({ error: "Object not found in R2" }, { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set("content-type", asset.content_type)
  headers.set("cache-control", "private, no-store")
  headers.set("content-disposition", `attachment; filename="${asset.filename.replace(/"/g, "")}"`)
  headers.set("x-content-type-options", "nosniff")
  return new Response(object.body, { headers })
})

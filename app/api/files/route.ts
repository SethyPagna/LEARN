import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/data"
import { listMediaAssets, uploadMediaAsset } from "@/lib/storage"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return NextResponse.json({ files: await listMediaAssets(user) })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a file using the `file` field." }, { status: 400 })
  }

  const asset = await uploadMediaAsset({
    user,
    file,
    noteId: typeof form.get("noteId") === "string" ? String(form.get("noteId")) : null,
    source: typeof form.get("source") === "string" ? String(form.get("source")) : "upload",
  })

  return NextResponse.json({ file: asset }, { status: 201 })
}

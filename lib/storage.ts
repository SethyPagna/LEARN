import { getR2Bucket } from "./cloudflare"
import { query } from "./db"
import type { User } from "./data"
import { createId } from "./schema"

export interface MediaAsset {
  id: string
  workspace_id: string
  owner_user_id: string
  bucket: string
  object_key: string
  filename: string
  content_type: string
  size_bytes: number
  note_id?: string | null
  source: string
  metadata: Record<string, unknown>
  created_at: string
}

function safeFilename(filename: string) {
  const clean = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return clean || "upload.bin"
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value) return value as Record<string, unknown>
  if (typeof value !== "string" || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === "object" && parsed ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function normalizeAsset(row: Record<string, unknown>): MediaAsset {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    owner_user_id: String(row.owner_user_id),
    bucket: String(row.bucket),
    object_key: String(row.object_key),
    filename: String(row.filename),
    content_type: String(row.content_type),
    size_bytes: Number(row.size_bytes || 0),
    note_id: row.note_id ? String(row.note_id) : null,
    source: String(row.source || "upload"),
    metadata: parseMetadata(row.metadata),
    created_at: String(row.created_at),
  }
}

export async function isR2Configured() {
  return Boolean(await getR2Bucket())
}

export async function uploadMediaAsset(input: {
  user: User
  file: File
  noteId?: string | null
  source?: string
}) {
  const bucket = await getR2Bucket()
  if (!bucket) {
    throw new Error("Cloudflare R2 binding LEARNING_OS_FILES is not configured")
  }

  const id = createId("asset")
  const filename = safeFilename(input.file.name)
  const objectKey = `workspaces/workspace_demo/users/${input.user.id}/${id}-${filename}`
  const body = await input.file.arrayBuffer()
  const contentType = input.file.type || "application/octet-stream"

  await bucket.put(objectKey, body, {
    httpMetadata: { contentType },
    customMetadata: {
      ownerUserId: input.user.id,
      filename,
      source: input.source || "upload",
    },
  })

  await query(
    `INSERT INTO media_assets
      (id, workspace_id, owner_user_id, bucket, object_key, filename, content_type, size_bytes, note_id, source, metadata)
     VALUES ($1, 'workspace_demo', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.user.id,
      "LEARNING_OS_FILES",
      objectKey,
      filename,
      contentType,
      input.file.size,
      input.noteId || null,
      input.source || "upload",
      JSON.stringify({ originalName: input.file.name }),
    ],
  )

  return getMediaAsset(id, input.user)
}

export async function listMediaAssets(user: User) {
  const result = await query(
    `SELECT * FROM media_assets
     WHERE owner_user_id = $1 OR $2 = 'admin'
     ORDER BY created_at DESC
     LIMIT 100`,
    [user.id, user.role],
  )
  return result.rows.map(normalizeAsset)
}

export async function getMediaAsset(id: string, user: User) {
  const result = await query(
    `SELECT * FROM media_assets
     WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin')
     LIMIT 1`,
    [id, user.id, user.role],
  )
  return result.rows[0] ? normalizeAsset(result.rows[0]) : null
}

export async function getMediaObject(asset: MediaAsset) {
  const bucket = await getR2Bucket()
  if (!bucket) {
    throw new Error("Cloudflare R2 binding LEARNING_OS_FILES is not configured")
  }

  return bucket.get(asset.object_key)
}

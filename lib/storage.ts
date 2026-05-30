import crypto from "node:crypto"
import { getR2Bucket } from "./cloudflare"
import { query } from "./db"
import { archiveContentItemForSource, attachMediaToContentSource, upsertContentItemForSource, type User } from "./data"
import { createId } from "./schema"
import { validateUploadFile } from "./file-security"

const APP_ID = "learn"
const DEFAULT_WORKSPACE_ID = "workspace_demo"
const DEFAULT_R2_BUCKET = "learn-files"
const R2_REGION = "auto"
const R2_SERVICE = "s3"

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

interface R2ApiConfig {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  endpoint: string
}

interface RuntimeEnv {
  [key: string]: string | undefined
}

function getProcessEnv(): RuntimeEnv {
  return typeof process === "undefined" ? {} : process.env
}

function safeFilename(filename: string) {
  const clean = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return clean || "upload.bin"
}

export function buildR2ObjectKey(input: {
  userId: string
  assetId: string
  filename: string
  workspaceId?: string
}) {
  return `apps/${APP_ID}/workspaces/${input.workspaceId || DEFAULT_WORKSPACE_ID}/users/${input.userId}/${input.assetId}-${safeFilename(input.filename)}`
}

export function getR2ApiConfig(env: RuntimeEnv = getProcessEnv()): R2ApiConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const accessKeyId = env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim()
  const bucket = env.CLOUDFLARE_R2_BUCKET?.trim() || DEFAULT_R2_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey) return null
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  }
}

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseMediaAssetMetadata(value: unknown): Record<string, unknown> {
  if (isMetadataRecord(value)) return value
  if (typeof value !== "string" || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return isMetadataRecord(parsed) ? parsed : {}
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
    metadata: parseMediaAssetMetadata(row.metadata),
    created_at: String(row.created_at),
  }
}

function hashPayload(value: BodyInit | null) {
  if (!value) return crypto.createHash("sha256").update("").digest("hex")
  if (typeof value === "string") return crypto.createHash("sha256").update(value).digest("hex")
  if (value instanceof ArrayBuffer) return crypto.createHash("sha256").update(Buffer.from(value)).digest("hex")
  if (ArrayBuffer.isView(value)) return crypto.createHash("sha256").update(Buffer.from(value.buffer)).digest("hex")
  return "UNSIGNED-PAYLOAD"
}

function hmac(key: crypto.BinaryLike, value: string) {
  return crypto.createHmac("sha256", key).update(value).digest()
}

function signingKey(secret: string, date: string) {
  const dateKey = hmac(`AWS4${secret}`, date)
  const regionKey = hmac(dateKey, R2_REGION)
  const serviceKey = hmac(regionKey, R2_SERVICE)
  return hmac(serviceKey, "aws4_request")
}

async function signedR2Fetch(config: R2ApiConfig, input: {
  method: string
  key?: string
  query?: string
  body?: BodyInit | null
  contentType?: string
}) {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
  const dateStamp = amzDate.slice(0, 8)
  const path = `/${config.bucket}${input.key ? `/${input.key.split("/").map(encodeURIComponent).join("/")}` : ""}`
  const queryString = input.query || ""
  const host = new URL(config.endpoint).host
  const payloadHash = hashPayload(input.body || null)
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  }
  if (input.contentType) headers["content-type"] = input.contentType

  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join("")
  const canonicalRequest = [
    input.method,
    path,
    queryString,
    canonicalHeaders,
    signedHeaderNames.join(";"),
    payloadHash,
  ].join("\n")
  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n")
  const signature = crypto.createHmac("sha256", signingKey(config.secretAccessKey, dateStamp)).update(stringToSign).digest("hex")

  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`
  const url = `${config.endpoint}${path}${queryString ? `?${queryString}` : ""}`
  return fetch(url, {
    method: input.method,
    headers: { ...headers, authorization },
    body: input.body,
  })
}

async function getConfiguredR2BucketName() {
  return (typeof process === "undefined" ? undefined : process.env.CLOUDFLARE_R2_BUCKET) || DEFAULT_R2_BUCKET
}

export async function isR2Configured() {
  return Boolean((await getR2Bucket()) || getR2ApiConfig())
}

async function putObject(key: string, body: ArrayBuffer, contentType: string, metadata: Record<string, string>) {
  const binding = await getR2Bucket()
  if (binding) {
    await binding.put(key, body, {
      httpMetadata: { contentType },
      customMetadata: metadata,
    })
    return
  }

  const config = getR2ApiConfig()
  if (!config) {
    throw new Error("Cloudflare R2 is not configured. Set LEARN_FILES binding or Cloudflare R2 API credentials.")
  }
  const response = await signedR2Fetch(config, { method: "PUT", key, body, contentType })
  if (!response.ok) throw new Error(`Cloudflare R2 upload failed with ${response.status}.`)
}

export async function uploadMediaAsset(input: {
  user: User
  file: File
  noteId?: string | null
  source?: string
}) {
  const id = createId("asset")
  const filename = safeFilename(input.file.name)
  const objectKey = buildR2ObjectKey({ userId: input.user.id, assetId: id, filename })
  const body = await input.file.arrayBuffer()
  const contentType = input.file.type || "application/octet-stream"
  const validationError = validateUploadFile(input.file, body)
  if (validationError) throw new Error(validationError)

  await putObject(objectKey, body, contentType, {
    ownerUserId: input.user.id,
    filename,
    source: input.source || "upload",
  })

  await query(
    `INSERT INTO media_assets
      (id, workspace_id, owner_user_id, bucket, object_key, filename, content_type, size_bytes, note_id, source, metadata)
     VALUES ($1, 'workspace_demo', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.user.id,
      await getConfiguredR2BucketName(),
      objectKey,
      filename,
      contentType,
      input.file.size,
      input.noteId || null,
      input.source || "upload",
      JSON.stringify({ originalName: input.file.name }),
    ],
  )
  await upsertContentItemForSource({
    workspaceId: DEFAULT_WORKSPACE_ID,
    ownerUserId: input.user.id,
    itemType: "media",
    sourceTable: "media_assets",
    sourceId: id,
    title: filename,
    summary: `${contentType} upload`,
  })
  if (input.noteId) {
    await attachMediaToContentSource("notes", input.noteId, id, "attachment")
  }

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
  const binding = await getR2Bucket()
  if (binding) return binding.get(asset.object_key)

  const config = getR2ApiConfig()
  if (!config) {
    throw new Error("Cloudflare R2 is not configured. Set LEARN_FILES binding or Cloudflare R2 API credentials.")
  }
  const response = await signedR2Fetch(config, { method: "GET", key: asset.object_key })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Cloudflare R2 download failed with ${response.status}.`)
  return {
    body: response.body,
    httpMetadata: { contentType: response.headers.get("content-type") || asset.content_type },
    size: Number(response.headers.get("content-length") || asset.size_bytes),
    writeHttpMetadata(headers: Headers) {
      const contentType = response.headers.get("content-type")
      if (contentType) headers.set("content-type", contentType)
    },
  }
}

export async function deleteMediaAsset(id: string, user: User) {
  const asset = await getMediaAsset(id, user)
  if (!asset) return false

  const binding = await getR2Bucket()
  if (binding) {
    await binding.delete(asset.object_key)
  } else {
    const config = getR2ApiConfig()
    if (config) {
      const response = await signedR2Fetch(config, { method: "DELETE", key: asset.object_key })
      if (!response.ok && response.status !== 404) throw new Error(`Cloudflare R2 delete failed with ${response.status}.`)
    }
  }

  await query("DELETE FROM media_assets WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin')", [id, user.id, user.role])
  await archiveContentItemForSource("media_assets", id)
  return true
}

export const SOCIAL_TARGET_TYPES = [
  "content_item",
  "learning_space",
  "chat_message",
  "micro_lesson",
  "profile",
  "study_battle",
  "study_room",
] as const

export type SocialTargetType = typeof SOCIAL_TARGET_TYPES[number]
export type ConnectionType = "follow" | "friend"
export type ConnectionStatus = "pending" | "accepted" | "blocked"
export type PermissionRole = "none" | "viewer" | "commenter" | "editor" | "owner"

const roleRank: Record<PermissionRole, number> = {
  none: 0,
  viewer: 1,
  commenter: 2,
  editor: 3,
  owner: 4,
}

const legacyContentTargets = new Set([
  "note",
  "notes",
  "doc",
  "docs",
  "sheet",
  "sheets",
  "slide",
  "slides",
  "slide_deck",
  "media",
  "file",
  "quiz",
  "review_item",
  "knowledge_node",
])

export interface SharingUserLike {
  id: string
  role?: string
}

export interface ContentItemLike {
  id: string
  owner_user_id: string
  visibility?: string | null
  archived_at?: string | null
}

export interface SharedAccessLike {
  content_item_id: string
  grantee_type: "user" | "group" | "space" | "public_link"
  grantee_id?: string | null
  role: Exclude<PermissionRole, "none">
  expires_at?: string | null
}

export interface PermissionContext {
  user: SharingUserLike
  contentItem: ContentItemLike | null
  grants?: SharedAccessLike[]
  groupIds?: string[]
  spaceIds?: string[]
  now?: Date
}

export interface NormalizedConnectionInput {
  requesterUserId: string
  targetUserId: string
  connectionType: ConnectionType
  status: ConnectionStatus
}

export interface NormalizedSocialActionInput {
  targetType: SocialTargetType
  targetId: string
  actionType: string
  body: string
  metadata: Record<string, unknown>
}

export function isSocialTargetType(value: string): value is SocialTargetType {
  return (SOCIAL_TARGET_TYPES as readonly string[]).includes(value)
}

export function normalizeSocialTargetType(value: unknown): SocialTargetType | null {
  const target = String(value || "content_item").trim().toLowerCase()
  if (isSocialTargetType(target)) return target
  if (legacyContentTargets.has(target)) return "content_item"
  return null
}

export function normalizeSocialActionInput(input: Record<string, unknown>): NormalizedSocialActionInput {
  const targetType = normalizeSocialTargetType(input.targetType || input.target_type)
  if (!targetType) throw new Error("Unsupported social target type.")

  const targetId = String(input.targetId || input.target_id || "").trim()
  if (!targetId) throw new Error("A target id is required.")

  const actionType = String(input.actionType || input.action_type || "comment").trim().toLowerCase()
  if (!actionType || !/^[a-z][a-z0-9_-]{1,39}$/.test(actionType)) throw new Error("Unsupported social action type.")

  const body = String(input.body || "").trim().slice(0, 4000)
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {}

  return { targetType, targetId, actionType, body, metadata }
}

export function normalizeConnectionInput(input: {
  requesterUserId: string
  targetUserId: string
  connectionType?: string
  status?: string
}): NormalizedConnectionInput {
  const requesterUserId = input.requesterUserId.trim()
  const targetUserId = input.targetUserId.trim()
  if (!requesterUserId || !targetUserId) throw new Error("Both users are required.")
  if (requesterUserId === targetUserId) throw new Error("A user cannot connect to themselves.")

  const connectionType = input.connectionType === "friend" ? "friend" : "follow"
  const status = input.status === "blocked" ? "blocked" : input.status === "pending" ? "pending" : "accepted"

  return { requesterUserId, targetUserId, connectionType, status }
}

export function isGrantActive(grant: SharedAccessLike, now = new Date()) {
  if (!grant.expires_at) return true
  const expiresAt = Date.parse(grant.expires_at)
  return Number.isFinite(expiresAt) && expiresAt > now.getTime()
}

export function higherRole(a: PermissionRole, b: PermissionRole): PermissionRole {
  return roleRank[a] >= roleRank[b] ? a : b
}

export function resolveContentPermission(input: PermissionContext): PermissionRole {
  const item = input.contentItem
  if (!item || item.archived_at) return "none"
  if (input.user.role === "admin" || item.owner_user_id === input.user.id) return "owner"

  let resolved: PermissionRole = item.visibility === "public" ? "viewer" : "none"
  const groupIds = new Set(input.groupIds || [])
  const spaceIds = new Set(input.spaceIds || [])
  const now = input.now || new Date()

  for (const grant of input.grants || []) {
    if (grant.content_item_id !== item.id || !isGrantActive(grant, now)) continue
    const matches =
      (grant.grantee_type === "user" && grant.grantee_id === input.user.id) ||
      (grant.grantee_type === "group" && Boolean(grant.grantee_id && groupIds.has(grant.grantee_id))) ||
      (grant.grantee_type === "space" && Boolean(grant.grantee_id && spaceIds.has(grant.grantee_id))) ||
      grant.grantee_type === "public_link"
    if (matches) resolved = higherRole(resolved, grant.role)
  }

  return resolved
}

export function canUseContentRole(actual: PermissionRole, required: Exclude<PermissionRole, "none">) {
  return roleRank[actual] >= roleRank[required]
}

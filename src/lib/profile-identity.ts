import type { PublicProfile, User } from "../components/learn/types"

export type ProfileVisibility = "private" | "connections" | "public"
export interface ProfileIdentityDraft {
  name: string
  bio: string
  avatarUrl: string
  visibility: ProfileVisibility
  introUrl: string
  websiteUrl: string
  facebookUrl: string
}

export const MAX_PROFILE_AVATAR_BYTES = 256 * 1024
export const MAX_PROFILE_BIO_LENGTH = 800
const pendingIdentitySaves = new Set<string>()

/** The account panel and direct profile route share one pending save per user. */
export function beginProfileIdentitySave(userId: string): (() => void) | null {
  if (pendingIdentitySaves.has(userId)) return null
  pendingIdentitySaves.add(userId)
  let active = true
  return () => {
    if (!active) return
    active = false
    pendingIdentitySaves.delete(userId)
  }
}

export function normalizeProfileVisibility(value: unknown): ProfileVisibility {
  return value === "public" || value === "connections" ? value : "private"
}

export function profilePreferenceString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function isProfileExternalLink(href: string): boolean {
  try { return ["https:", "http:"].includes(new URL(href).protocol) } catch { return false }
}

export function createProfileIdentityDraft(user: User, profile?: PublicProfile | null): ProfileIdentityDraft {
  return {
    name: profile?.name ?? user.name,
    bio: profile?.bio ?? user.bio ?? "",
    avatarUrl: profile?.avatar_url ?? user.avatarUrl ?? "",
    visibility: normalizeProfileVisibility(profile?.profile_visibility ?? user.profileVisibility),
    introUrl: profile?.social_links?.intro ?? profilePreferenceString(user.preferences.introUrl),
    websiteUrl: profile?.social_links?.website ?? profilePreferenceString(user.preferences.websiteUrl),
    facebookUrl: profile?.social_links?.facebook ?? profilePreferenceString(user.preferences.facebookUrl),
  }
}

export function profileAvatarFileError(file: Pick<File, "type" | "size">): string | null {
  if (!file.type.startsWith("image/")) return "Choose an image file."
  if (file.size > MAX_PROFILE_AVATAR_BYTES) return "Use an avatar under 256 KB."
  return null
}

export function profileIdentityDraftError(draft: ProfileIdentityDraft): string | null {
  if (!draft.name.trim()) return "Enter your name."
  if ([draft.introUrl, draft.websiteUrl, draft.facebookUrl].some(value => value.trim() && !isProfileExternalLink(value.trim()))) {
    return "Links need to start with https:// or http://."
  }
  return null
}

export function profileIdentityUpdate(draft: ProfileIdentityDraft) {
  return {
    name: draft.name.trim(), bio: draft.bio, avatarUrl: draft.avatarUrl, profileVisibility: draft.visibility,
    preferences: { introUrl: draft.introUrl.trim(), websiteUrl: draft.websiteUrl.trim(), facebookUrl: draft.facebookUrl.trim() },
  }
}

export function reconcileProfileIdentityDraft(draft: ProfileIdentityDraft, baseline: ProfileIdentityDraft, incoming: ProfileIdentityDraft): ProfileIdentityDraft {
  function next<K extends keyof ProfileIdentityDraft>(field: K): ProfileIdentityDraft[K] {
    return draft[field] === baseline[field] ? incoming[field] : draft[field]
  }
  return { name: next("name"), bio: next("bio"), avatarUrl: next("avatarUrl"), visibility: next("visibility"), introUrl: next("introUrl"), websiteUrl: next("websiteUrl"), facebookUrl: next("facebookUrl") }
}

export function profileWithSavedIdentity(profile: PublicProfile, user: User): PublicProfile {
  return {
    ...profile, name: user.name, bio: user.bio ?? "", avatar_url: user.avatarUrl ?? "", profile_visibility: user.profileVisibility,
    social_links: { intro: profilePreferenceString(user.preferences.introUrl), website: profilePreferenceString(user.preferences.websiteUrl), facebook: profilePreferenceString(user.preferences.facebookUrl) },
  }
}

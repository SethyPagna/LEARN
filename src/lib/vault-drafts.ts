import type { VaultBlockType } from "./learning-ecosystem"

const VAULT_DRAFT_KEY = "learn_vault_block_draft_v1"
const BLOCK_TYPES: readonly VaultBlockType[] = ["text", "heading", "toggle", "image", "code", "equation", "quiz", "flashcard", "diagram"]
type DraftStorage = Pick<Storage, "getItem" | "setItem">

export interface VaultBlockDraft {
  blockType: VaultBlockType
  text: string
  revision: string
}

export function vaultDraftStorageKey(noteId: string) {
  return `${VAULT_DRAFT_KEY}:${encodeURIComponent(noteId)}`
}

export function readVaultBlockDraft(storage: DraftStorage, noteId: string): VaultBlockDraft | null {
  const raw = storage.getItem(vaultDraftStorageKey(noteId))
  if (!raw) return null
  try {
    const draft: unknown = JSON.parse(raw)
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null
    const value = draft as Record<string, unknown>
    if (typeof value.text !== "string" || typeof value.revision !== "string" || !BLOCK_TYPES.includes(value.blockType as VaultBlockType)) return null
    return { blockType: value.blockType as VaultBlockType, text: value.text, revision: value.revision }
  } catch { return null }
}

export function writeVaultBlockDraft(storage: DraftStorage, noteId: string, draft: VaultBlockDraft) {
  storage.setItem(vaultDraftStorageKey(noteId), JSON.stringify(draft))
}

/** A late successful save must leave a newer draft in this or another tab intact. */
export function completeVaultBlockDraft(storage: DraftStorage, noteId: string, submitted: VaultBlockDraft, revision: string): VaultBlockDraft | null {
  if (readVaultBlockDraft(storage, noteId)?.revision !== submitted.revision) return null
  const cleared = { ...submitted, text: "", revision }
  writeVaultBlockDraft(storage, noteId, cleared)
  return cleared
}

import assert from "node:assert/strict"
import test from "node:test"
import { completeVaultBlockDraft, readVaultBlockDraft, vaultDraftStorageKey, writeVaultBlockDraft, type VaultBlockDraft } from "../../lib/vault-drafts"

function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

test("Vault drafts restore text and type independently for each note", () => {
  const saved = storage()
  const first: VaultBlockDraft = { blockType: "equation", text: "E = mc²", revision: "first" }
  const second: VaultBlockDraft = { blockType: "code", text: "print('hello')", revision: "second" }
  writeVaultBlockDraft(saved, "note/a", first)
  writeVaultBlockDraft(saved, "note:b", second)
  assert.deepEqual(readVaultBlockDraft(saved, "note/a"), first)
  assert.deepEqual(readVaultBlockDraft(saved, "note:b"), second)
  assert.equal(readVaultBlockDraft(saved, "other"), null)
})

test("a late block save cannot clear a newer draft even when its text is identical", () => {
  const saved = storage()
  const submitted: VaultBlockDraft = { blockType: "text", text: "Keep this idea", revision: "submitted" }
  const newer = { ...submitted, revision: "edited-again" }
  writeVaultBlockDraft(saved, "note", newer)
  assert.equal(completeVaultBlockDraft(saved, "note", submitted, "cleared"), null)
  assert.deepEqual(readVaultBlockDraft(saved, "note"), newer)
})

test("a confirmed matching save clears only its submitted text and retains block type", () => {
  const saved = storage()
  const submitted: VaultBlockDraft = { blockType: "heading", text: "Cells", revision: "submitted" }
  writeVaultBlockDraft(saved, "note", submitted)
  writeVaultBlockDraft(saved, "other", { ...submitted, text: "Unrelated", revision: "other" })
  assert.deepEqual(completeVaultBlockDraft(saved, "note", submitted, "cleared"), { blockType: "heading", text: "", revision: "cleared" })
  assert.equal(readVaultBlockDraft(saved, "other")?.text, "Unrelated")
})

test("invalid draft storage is ignored and write failures remain visible to callers", () => {
  const saved = storage()
  for (const raw of ["{bad", "null", "[]", '{"blockType":"made-up","text":"draft","revision":"x"}']) {
    saved.setItem(vaultDraftStorageKey("note"), raw)
    assert.equal(readVaultBlockDraft(saved, "note"), null)
  }
  const denied = { ...saved, setItem: () => { throw new Error("quota") } }
  assert.throws(() => writeVaultBlockDraft(denied, "note", { blockType: "text", text: "Kept in memory", revision: "x" }), /quota/)
})

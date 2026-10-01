"use client"

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react"
import { Camera, Check, ChevronDown, X } from "lucide-react"
import {
  beginProfileIdentitySave, createProfileIdentityDraft, MAX_PROFILE_BIO_LENGTH, normalizeProfileVisibility,
  profileAvatarFileError, profileIdentityDraftError, profileIdentityUpdate, reconcileProfileIdentityDraft, type ProfileIdentityDraft,
} from "@/lib/profile-identity"
import { api } from "./api"
import type { PublicProfile, User } from "./types"
import styles from "./profile-identity-editor.module.css"

export interface ProfileIdentityEditorState {
  editing: boolean
  draft: ProfileIdentityDraft
  saveBusy: boolean
  avatarBusy: boolean
  status: string
  nameInput: RefObject<HTMLInputElement | null>
  editButton: RefObject<HTMLButtonElement | null>
  startEditing: () => void
  cancelEditing: () => void
  updateDraft: <K extends keyof ProfileIdentityDraft>(field: K, value: ProfileIdentityDraft[K]) => void
  selectAvatar: (file?: File) => void
  saveProfile: (event: FormEvent<HTMLFormElement>) => Promise<void>
}

export function useProfileIdentityEditor({ user, profile, onSaved }: {
  user: User | null
  profile?: PublicProfile | null
  onSaved: (user: User) => void
}): ProfileIdentityEditorState {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ProfileIdentityDraft>(() => user ? createProfileIdentityDraft(user, profile) : {
    name: "", bio: "", avatarUrl: "", visibility: "private", introUrl: "", websiteUrl: "", facebookUrl: "",
  })
  const [saveBusy, setSaveBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [status, setStatus] = useState("")
  const nameInput = useRef<HTMLInputElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  const avatarReader = useRef<FileReader | null>(null)
  const savePending = useRef(false)
  const currentUser = useRef(user)
  const reconciledUser = useRef(user)
  const draftBaseline = useRef<ProfileIdentityDraft | null>(null)
  currentUser.current = user

  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus()
    wasEditing.current = editing
  }, [editing])

  useEffect(() => {
    setEditing(false)
    setStatus("")
    draftBaseline.current = null
    const reader = avatarReader.current
    avatarReader.current = null
    reader?.abort()
    setAvatarBusy(false)
  }, [user?.id])

  useEffect(() => {
    const previousUser = reconciledUser.current
    reconciledUser.current = user
    if (!user || !previousUser || previousUser.id !== user.id || !editing || !draftBaseline.current) return
    const incoming = createProfileIdentityDraft(user)
    const previous = createProfileIdentityDraft(previousUser)
    const fields = Object.keys(incoming) as (keyof ProfileIdentityDraft)[]
    if (fields.every(field => incoming[field] === previous[field])) return
    const baseline = draftBaseline.current
    setDraft(current => reconcileProfileIdentityDraft(current, baseline, incoming))
    draftBaseline.current = incoming
    setStatus("Your profile changed elsewhere. Review before saving.")
  }, [user, editing])

  useEffect(() => () => {
    const reader = avatarReader.current
    avatarReader.current = null
    reader?.abort()
  }, [])

  function startEditing() {
    if (!user) return
    if (editing) { nameInput.current?.focus(); return }
    const initialDraft = createProfileIdentityDraft(user, profile)
    draftBaseline.current = initialDraft
    setDraft(initialDraft)
    setStatus("")
    setEditing(true)
  }

  function cancelEditing() {
    if (savePending.current) return
    const reader = avatarReader.current
    avatarReader.current = null
    reader?.abort()
    setAvatarBusy(false)
    draftBaseline.current = null
    setEditing(false)
    setStatus("")
  }

  function updateDraft<K extends keyof ProfileIdentityDraft>(field: K, value: ProfileIdentityDraft[K]) {
    setDraft(current => ({ ...current, [field]: value }))
  }

  function selectAvatar(file?: File) {
    if (!file) return
    const error = profileAvatarFileError(file)
    if (error) { setStatus(error); return }
    const previous = avatarReader.current
    avatarReader.current = null
    previous?.abort()
    const reader = new FileReader()
    avatarReader.current = reader
    setAvatarBusy(true)
    reader.onload = () => {
      if (typeof reader.result !== "string" || avatarReader.current !== reader) return
      updateDraft("avatarUrl", reader.result)
      setStatus("")
    }
    reader.onerror = () => { if (avatarReader.current === reader) setStatus("Unable to read that image.") }
    reader.onloadend = () => { if (avatarReader.current === reader) { avatarReader.current = null; setAvatarBusy(false) } }
    reader.readAsDataURL(file)
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || savePending.current || avatarReader.current) return
    const error = profileIdentityDraftError(draft)
    if (error) {
      setStatus(error)
      event.currentTarget.querySelector("details")?.setAttribute("open", "")
      return
    }
    const userId = user.id
    const releaseSave = beginProfileIdentitySave(userId)
    if (!releaseSave) { setStatus("Your profile is already saving. Try again in a moment."); return }
    savePending.current = true
    setSaveBusy(true)
    setStatus("")
    try {
      const { user: savedUser } = await api<{ user: User }>("/api/profile", { method: "PUT", body: JSON.stringify(profileIdentityUpdate(draft)) })
      if (currentUser.current?.id !== userId) return
      onSaved(savedUser)
      draftBaseline.current = null
      setEditing(false)
      setStatus("Profile saved.")
    } catch (error) {
      if (currentUser.current?.id === userId) setStatus(error instanceof Error ? error.message : "Unable to save profile.")
    } finally { releaseSave(); savePending.current = false; setSaveBusy(false) }
  }

  return { editing, draft, saveBusy, avatarBusy, status, nameInput, editButton, startEditing, cancelEditing, updateDraft, selectAvatar, saveProfile }
}

export function ProfileIdentityEditor({ editor, id }: { editor: ProfileIdentityEditorState; id?: string }) {
  const { draft, saveBusy, avatarBusy, nameInput, updateDraft, selectAvatar, cancelEditing, saveProfile } = editor
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const input = nameInput.current
      if (input && !input.matches(":disabled")) input.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [nameInput])
  return <form id={id} className={styles.form} aria-label="Edit profile" onSubmit={event => void saveProfile(event)}>
    <fieldset disabled={saveBusy || avatarBusy}>
      <legend className="sr-only">Edit profile</legend>
      <div className={styles.avatarEditor}>
        <span className={styles.avatar}>{draft.avatarUrl ? <img src={draft.avatarUrl} alt="" loading="eager" decoding="async" /> : draft.name.trim().slice(0, 1).toUpperCase() || "L"}</span>
        <label className={styles.secondaryButton}><Camera aria-hidden="true" /><span>Photo</span><input type="file" accept="image/*" className="sr-only" onChange={event => { selectAvatar(event.target.files?.[0]); event.target.value = "" }} /></label>
        {draft.avatarUrl ? <button type="button" className={styles.iconButton} title="Remove photo" aria-label="Remove photo" onClick={() => updateDraft("avatarUrl", "")}><X aria-hidden="true" /></button> : null}
      </div>
      <div className={styles.fields}>
        <label><span>Name</span><input ref={nameInput} autoComplete="name" required value={draft.name} onChange={event => updateDraft("name", event.target.value)} /></label>
        <label><span>Visibility</span><select aria-label="Visibility" value={draft.visibility} onChange={event => updateDraft("visibility", normalizeProfileVisibility(event.target.value))}><option value="private">Private</option><option value="connections">Connections</option><option value="public">Public</option></select></label>
        <label className={styles.bioField}><span>About</span><textarea rows={3} maxLength={MAX_PROFILE_BIO_LENGTH} value={draft.bio} onChange={event => updateDraft("bio", event.target.value)} /></label>
      </div>
      <details className={styles.links}><summary>Links<ChevronDown aria-hidden="true" /></summary><div className={styles.linkFields}>{(["introUrl", "websiteUrl", "facebookUrl"] as const).map(field => <label key={field}><span>{field === "introUrl" ? "Intro" : field === "websiteUrl" ? "Website" : "Facebook"}</span><input type="url" placeholder="https://" value={draft[field]} onInvalid={event => event.currentTarget.closest("details")?.setAttribute("open", "")} onChange={event => updateDraft(field, event.target.value)} /></label>)}</div></details>
    </fieldset>
    <div className={styles.actions}><button type="button" className={styles.secondaryButton} disabled={saveBusy} onClick={cancelEditing}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={saveBusy || avatarBusy || !draft.name.trim()}>{saveBusy ? "Saving…" : "Save"}<Check aria-hidden="true" /></button></div>
    {editor.status ? <p className={styles.status} role="status">{editor.status}</p> : null}
  </form>
}

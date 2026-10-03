"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { MAX_SOCIAL_MEDIA_BYTES, MAX_STORY_TEXT, type SocialStory } from "@/lib/social-media"
import { Plus, X } from "lucide-react"
import { api } from "../api"

export function ChatStories({ currentUserId, groups }: { currentUserId: string; groups: Array<{ id: string; name: string }> }) {
  const [stories, setStories] = useState<SocialStory[]>([])
  const [body, setBody] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [audience, setAudience] = useState<SocialStory["audience"]>("private")
  const [groupId, setGroupId] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [now, setNow] = useState(Date.now())
  const [selectedId, setSelectedId] = useState("")
  const [composing, setComposing] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const selected = stories.find(story => story.id === selectedId && Date.parse(story.expiresAt) > now)
  useEffect(() => { if (composing || selected) dialog.current?.showModal(); else dialog.current?.close() }, [composing, selected])
  function closeStory() { setComposing(false); setSelectedId("") }


  async function refresh() {
    const response = await api<{ items: SocialStory[] }>("/api/stories")
    setStories(response.items)
    setNow(Date.now())
  }

  useEffect(() => {
    if (!currentUserId) return
    let cancelled = false
    const update = async () => {
      if (document.hidden) return
      try {
        const response = await api<{ items: SocialStory[] }>("/api/stories")
        if (!cancelled) { setStories(response.items); setNow(Date.now()) }
      } catch (error) { if (!cancelled) setStatus(error instanceof Error ? error.message : "Could not load stories.") }
    }
    void update()
    const timer = setInterval(() => { setNow(Date.now()); void update() }, 60000)
    document.addEventListener("visibilitychange", update)
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", update) }
  }, [currentUserId])

  async function post() {
    if (busy) return
    setBusy(true); setStatus("")
    try {
      let fileId: string | undefined
      if (file) {
        const form = new FormData(); form.append("file", file); form.append("source", "story")
        const upload = await api<{ file: { id: string } }>("/api/files", { method: "POST", body: form })
        fileId = upload.file.id
      }
      await api("/api/stories", { method: "POST", body: JSON.stringify({ body, fileId, audience, ...(audience === "group" ? { groupId } : {}) }) })
      setBody(""); setFile(null); setComposing(false)
      setStatus("Story posted. It expires in 24 hours.")
      await refresh()
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not post story.") }
    finally { setBusy(false) }
  }

  async function remove(id: string) {
    if (busy) return
    setBusy(true)
    try { await api(`/api/stories?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await refresh(); setStatus("Story deleted.") }
    catch (error) { setStatus(error instanceof Error ? error.message : "Could not delete story.") }
    finally { setBusy(false) }
  }

  const visible = stories.filter((story) => Date.parse(story.expiresAt) > now)
  return <section aria-label="Stories">
    <div className="story-strip"><button className="story-avatar" onClick={() => { setSelectedId(""); setComposing(true) }} aria-label="Add a story"><span><Plus className="h-5 w-5" /></span><small>Your story</small></button>{visible.map(story => <button className="story-avatar" key={story.id} onClick={() => { setComposing(false); setSelectedId(story.id) }} aria-label={`View ${story.ownerName}'s story`}><span>{story.fileId ? <img src={`/api/files/${encodeURIComponent(story.fileId)}/download`} alt="" loading="lazy" /> : story.ownerName.slice(0, 1)}</span><small>{story.ownerUserId === currentUserId ? "You" : story.ownerName}</small></button>)}</div>
    {(composing || selected) ? createPortal(<dialog ref={dialog} aria-label={composing ? "New story" : `${selected?.ownerName || "Your"} story`} onCancel={closeStory} className="story-dialog"><button aria-label="Close story" className="editor-command ml-auto" onClick={closeStory}><X className="h-4 w-4" /></button>
      {selected ? <article className="p-2"><h3 className="font-semibold">{selected.ownerName}</h3>{selected.fileId ? <img src={`/api/files/${encodeURIComponent(selected.fileId)}/download`} loading="eager" decoding="async" alt={selected.body || "Story picture"} className="mt-3 max-h-[50dvh] w-full rounded-xl object-contain" /> : null}<p className="story-text">{selected.body}</p><p className="text-xs text-muted-foreground">{selected.audience === "private" ? "Only you" : selected.audience === "friends" ? "Friends" : "Group"} · expires {new Date(selected.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>{selected.ownerUserId === currentUserId ? <button className="editor-command mt-3 text-destructive" disabled={busy} onClick={() => void remove(selected.id)}>Delete story</button> : null}</article> : null}
      {composing ? <>    <fieldset disabled={busy} className="mt-3 grid gap-2 border-t border-border pt-3">
      <legend className="px-1 font-semibold">New story</legend>
      <textarea aria-label="Story text" placeholder="Share a study update…" maxLength={MAX_STORY_TEXT} value={body} onChange={(event) => setBody(event.target.value)} className="rounded-lg border bg-background p-2" />
      <label className="grid gap-1 text-xs">Optional picture or GIF
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={(event) => {
          const next = event.target.files?.[0]; event.target.value = ""
          if (!next) return
          if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(next.type) || next.size > MAX_SOCIAL_MEDIA_BYTES) { setStatus("Choose a supported picture under 20 MB."); return }
          setFile(next)
        }} />
      </label>
      {file ? <p className="text-xs">{file.name} <button type="button" onClick={() => setFile(null)} className="underline">Remove picture</button></p> : null}
      <label className="grid gap-1 text-xs">Who can see this story?
        <select value={audience} onChange={(event) => setAudience(event.target.value as SocialStory["audience"])} className="rounded border bg-background p-2">
          <option value="private">Only me</option><option value="friends">Accepted friends</option><option value="group" disabled={!groups.length}>A group</option>
        </select>
      </label>
      {audience === "group" ? <select aria-label="Story group" value={groupId} onChange={(event) => setGroupId(event.target.value)} className="rounded border bg-background p-2"><option value="">Choose a group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select> : null}
      <button type="button" disabled={(!body.trim() && !file) || (audience === "group" && !groupId)} onClick={post} className="justify-self-start rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Share for 24h"}</button>
    </fieldset></> : null}
      {status ? <p role="status" className="mt-2 text-xs">{status}</p> : null}
    </dialog>, document.body) : null}
    {status && !composing && !selected ? <p role="status" className="text-xs text-muted-foreground">{status}</p> : null}
  </section>
}

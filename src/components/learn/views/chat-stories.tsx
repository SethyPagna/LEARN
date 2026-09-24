"use client"

import { useEffect, useState } from "react"
import { MAX_SOCIAL_MEDIA_BYTES, MAX_STORY_TEXT, type SocialStory } from "@/lib/social-media"
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
      setBody(""); setFile(null)
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
  return <details className="rounded-xl border border-border bg-background p-3 text-sm">
    <summary className="cursor-pointer font-semibold">Stories · {visible.length} active</summary>
    <p className="mt-2 text-xs text-muted-foreground">Text and picture updates that disappear after 24 hours. Choose who can see each story.</p>
    <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
      {visible.map((story) => <article key={story.id} className="w-56 shrink-0 rounded-xl border border-border p-3">
        <p className="font-semibold">{story.ownerName}{story.ownerUserId === currentUserId ? " · You" : ""}</p>
        {story.fileId ? <img src={`/api/files/${encodeURIComponent(story.fileId)}/download`} alt={story.body || `${story.ownerName}'s story`} loading="lazy" decoding="async" className="mt-2 max-h-48 w-full rounded-lg object-contain" /> : null}
        <p className="mt-2 whitespace-pre-wrap break-words">{story.body}</p>
        <p className="mt-2 text-xs text-muted-foreground">{story.audience === "private" ? "Only you" : story.audience === "friends" ? "Friends" : "Group"} · expires {new Date(story.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        {story.ownerUserId === currentUserId ? <button type="button" disabled={busy} onClick={() => remove(story.id)} className="mt-2 text-xs underline">Delete story</button> : null}
      </article>)}
      {!visible.length ? <p className="text-xs text-muted-foreground">No active stories in your audience.</p> : null}
    </div>
    <fieldset disabled={busy} className="mt-3 grid gap-2 border-t border-border pt-3">
      <legend className="px-1 font-semibold">Post a story</legend>
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
      <button type="button" disabled={(!body.trim() && !file) || (audience === "group" && !groupId)} onClick={post} className="justify-self-start rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Post for 24 hours"}</button>
    </fieldset>
    {status ? <p role="status" className="mt-2 text-xs">{status}</p> : null}
  </details>
}

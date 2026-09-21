"use client"

/**
 * The share control for one content item — create, copy, list and revoke links.
 *
 * This is the only implementation of the behaviour. The design canvas and the
 * quiz surface both show it, and both address it the same way: a link is a
 * `public_link` grant on the item's `content_items` row, so a caller names the
 * item by the source pair its registry row mirrors (`sourceTable` + `sourceId`)
 * rather than by a registry id it does not hold.
 *
 * A link grants a read. The copied URL is the rendered page at `/share/<token>` —
 * a session-less URL that answers 404 for a revoked, expired or archived item —
 * not the raw JSON route behind it, because the page is what the person holding
 * the link can actually use. The `editor` role is recorded on the grant and
 * shown here, but writing still needs a signed-in collaborator holding an editor
 * grant of their own: a forwarded URL is never a write credential.
 */

import { useCallback, useState } from "react"
import { Copy, Eye, Link2, Loader2, PenLine, Share2, Trash2 } from "lucide-react"

import { controlButtonClasses } from "@/lib/design-system"
import { api } from "./api"

export interface SharePanelProps {
  /** The table the item is stored in (`editor_documents`, `quizzes`, …). */
  sourceTable: string
  /** The record id inside that table. Empty means "not saved yet". */
  sourceId: string
  /** Trigger label. */
  label?: string
  className?: string
  /**
   * Class for the trigger button alone. The canvas passes its own `.canvas-tool`
   * so the control matches its toolbar; everything else gets the app's shared
   * control button.
   */
  triggerClassName?: string
  /** Shown when `sourceId` is empty, explaining why no link can be minted yet. */
  requiresSourceMessage?: string
}

interface ShareLinkSummary {
  id: string
  token: string
  role: "viewer" | "editor"
  expiresAt: string | null
  active: boolean
}

/**
 * The public URL a link *is*: the rendered share page. Built from the current
 * origin so a copied link works wherever the app is deployed.
 */
function shareLinkUrl(token: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin
  return `${origin}/share/${token}`
}

function shareRoleLabel(role: ShareLinkSummary["role"]) {
  return role === "editor" ? "Can edit" : "View only"
}

function shareExpiryLabel(link: ShareLinkSummary) {
  if (!link.expiresAt) return "No expiry"
  const expiresAt = new Date(link.expiresAt)
  if (Number.isNaN(expiresAt.getTime())) return "No expiry"
  const formatted = expiresAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
  return link.active ? `Expires ${formatted}` : `Expired ${formatted}`
}

export function SharePanel({
  sourceTable,
  sourceId,
  label = "Share",
  className = "",
  triggerClassName,
  requiresSourceMessage,
}: SharePanelProps) {
  const [open, setOpen] = useState(false)
  const [links, setLinks] = useState<ShareLinkSummary[]>([])
  const [role, setRole] = useState<ShareLinkSummary["role"]>("viewer")
  const [busy, setBusy] = useState("")
  const [status, setStatus] = useState("")

  /**
   * Listing and revoking are owner-only too — the API answers 400 "Only the
   * owner of an item can manage its share links." for anybody else, and the
   * panel simply surfaces whatever it says rather than pre-judging.
   */
  const load = useCallback(async () => {
    if (!sourceId) {
      setLinks([])
      return
    }
    setBusy("list")
    try {
      const response = await api<{ links: ShareLinkSummary[] }>(
        `/api/share?sourceTable=${encodeURIComponent(sourceTable)}&sourceId=${encodeURIComponent(sourceId)}`,
      )
      setLinks(response.links || [])
      setStatus("")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load share links.")
    } finally {
      setBusy("")
    }
  }, [sourceId, sourceTable])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) void load()
  }

  async function copy(link: ShareLinkSummary) {
    const url = shareLinkUrl(link.token)
    try {
      await navigator.clipboard.writeText(url)
      setStatus(`Copied the ${shareRoleLabel(link.role).toLowerCase()} link.`)
    } catch {
      // Clipboard access needs a secure context; showing the URL is the fallback
      // that still lets the link be selected by hand.
      setStatus(`Copy was blocked. The link is ${url}`)
    }
  }

  async function create() {
    if (!sourceId) return
    setBusy("create")
    try {
      const response = await api<{ link: ShareLinkSummary }>("/api/share", {
        method: "POST",
        body: JSON.stringify({ sourceTable, sourceId, role }),
      })
      setLinks((current) => [response.link, ...current])
      setStatus("")
      await copy(response.link)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create a share link.")
    } finally {
      setBusy("")
    }
  }

  async function revoke(id: string) {
    setBusy(id)
    try {
      await api(`/api/share?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      setLinks((current) => current.filter((link) => link.id !== id))
      setStatus("Link revoked. Every copy of it now answers 404.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to revoke that link.")
    } finally {
      setBusy("")
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        data-active={open ? "true" : "false"}
        onClick={toggle}
        className={triggerClassName || controlButtonClasses({ active: open, size: "compact" })}
        title="Share this item"
      >
        <Share2 className="h-4 w-4" />
        {label}
      </button>

      {open ? (
        <div className="mt-3 w-full space-y-3 rounded-[12px] bg-muted p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">New share link</span>
            {(["viewer", "editor"] as const).map((option) => (
              <button
                key={option}
                type="button"
                data-active={role === option}
                onClick={() => setRole(option)}
                className={triggerClassName || controlButtonClasses({ active: role === option, size: "compact" })}
                title={option === "editor" ? "Records edit intent on the link" : "Read-only link"}
              >
                {option === "editor" ? <PenLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {shareRoleLabel(option)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void create()}
              disabled={!sourceId || busy === "create"}
              className={triggerClassName || controlButtonClasses({ size: "compact" })}
            >
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Create link
            </button>
          </div>

          {!sourceId && requiresSourceMessage ? (
            <p className="text-xs text-muted-foreground">{requiresSourceMessage}</p>
          ) : null}

          {links.length ? (
            <ul className="space-y-1.5">
              {links.map((link) => (
                <li key={link.id} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-card p-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.7rem] font-semibold text-secondary-foreground">
                    {shareRoleLabel(link.role)}
                  </span>
                  <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{shareLinkUrl(link.token)}</code>
                  <span className={`text-[0.7rem] ${link.active ? "text-muted-foreground" : "text-destructive"}`}>{shareExpiryLabel(link)}</span>
                  <button type="button" onClick={() => void copy(link)} className={triggerClassName || controlButtonClasses({ size: "compact" })}>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => void revoke(link.id)}
                    disabled={busy === link.id}
                    className={triggerClassName || controlButtonClasses({ destructive: true, size: "compact" })}
                    title="Revoke this link"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          ) : sourceId && busy !== "list" ? (
            <p className="text-xs text-muted-foreground">No share links yet.</p>
          ) : null}

          {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
          <p className="text-xs text-muted-foreground">
            Anyone with a link can read this item through it — no account needed. Revoking a link revokes every copy of it.
          </p>
        </div>
      ) : null}
    </div>
  )
}

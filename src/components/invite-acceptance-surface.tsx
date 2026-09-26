"use client"

import { type FormEvent, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, Eye, EyeOff, Link2Off, LoaderCircle, Mail, RotateCw } from "lucide-react"
import { AuthFrame } from "@/components/auth-frame"
import { normalizeInviteAcceptance } from "@/lib/auth-entry"
import styles from "@/components/auth-surface.module.css"

type InviteStatus = "loading" | "ready" | "invalid" | "unavailable" | "accepted"

export function InviteAcceptanceSurface({ token }: { token: string }) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<InviteStatus>("loading")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [retry, setRetry] = useState(0)
  const pending = useRef(false)
  const validation = normalizeInviteAcceptance({ email, name, password, token })

  useEffect(() => {
    const controller = new AbortController()
    setStatus("loading")
    setMessage("")
    async function loadInvite() {
      try {
        const response = await fetch(`/api/invites/accept?token=${encodeURIComponent(token)}`, { signal: controller.signal })
        const json = await response.json().catch(() => ({}))
        if (controller.signal.aborted) return
        if (!response.ok || !json.invite?.ready) {
          setStatus(response.status === 429 || response.status >= 500 ? "unavailable" : "invalid")
          setMessage(json.error || "This invitation is no longer active.")
          return
        }
        setEmail(String(json.invite.email || ""))
        setStatus("ready")
      } catch {
        if (controller.signal.aborted) return
        setStatus("unavailable")
        setMessage("We couldn’t check your invite. Please try again.")
      }
    }
    void loadInvite()
    return () => controller.abort()
  }, [token, retry])

  async function acceptInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current || status !== "ready") return
    if (!validation.ok) {
      setMessage(validation.error)
      return
    }
    pending.current = true
    setSubmitting(true)
    setMessage("")
    let navigating = false
    try {
      const response = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validation.value),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(json.error || "Unable to accept your invite. Please try again.")
        return
      }
      setStatus("accepted")
      window.location.href = "/dashboard?onboarding=1"
      navigating = true
    } catch {
      setMessage("Unable to connect. Your details are still here — try again.")
    } finally {
      if (!navigating) {
        pending.current = false
        setSubmitting(false)
      }
    }
  }

  return <AuthFrame><section className={styles.formPanel} aria-labelledby="invite-heading">
    <div className={styles.formHeading}><p className={styles.eyebrow}>You’re invited</p><h1 id="invite-heading">Make yourself at home.</h1><p className={styles.description}>A few details, then it’s all yours.</p></div>
    {status === "loading" ? <div className={styles.inviteState} role="status"><LoaderCircle size={26} className={styles.spinner} aria-hidden="true" /><span>Checking your invite…</span></div> : null}
    {status === "invalid" || status === "unavailable" ? <div className={styles.inviteState}><span className={styles.invalidSymbol}><Link2Off size={25} aria-hidden="true" /></span><p role="alert">{message}</p>{status === "unavailable" ? <button type="button" className={styles.primaryButton} onClick={() => setRetry(retry + 1)}><RotateCw size={16} aria-hidden="true" />Try again</button> : <Link href="/login?mode=request" className={styles.primaryButton}>Request an invite<ArrowRight size={16} aria-hidden="true" /></Link>}</div> : null}
    {status === "accepted" ? <div className={styles.inviteState} role="status"><span className={styles.successSymbol}><Check size={28} aria-hidden="true" /></span><span>You’re in. Opening your workspace…</span></div> : null}
    {status === "ready" ? <form onSubmit={acceptInvite} className={styles.form} aria-busy={submitting}>
      <span className={styles.emailReceipt}><Mail size={16} aria-hidden="true" /><span>{email}</span></span>
      <label className={styles.field}>Name<input required minLength={2} maxLength={120} value={name} disabled={submitting} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Your name" /></label>
      <div className={styles.field}><label htmlFor="invite-password">Create a password</label><div className={styles.passwordField}><input id="invite-password" required minLength={10} maxLength={1024} value={password} disabled={submitting} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" type={showPassword ? "text" : "password"} placeholder="At least 10 characters" aria-describedby="invite-password-hint" /><button type="button" className={styles.passwordToggle} disabled={submitting} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div><span id="invite-password-hint" className={styles.fieldHint}>10 characters or more.</span></div>
      {message ? <p role="alert" className={styles.error}>{message}</p> : null}
      <button type="submit" disabled={submitting || !validation.ok} className={styles.primaryButton}>{submitting ? <LoaderCircle size={17} className={styles.spinner} aria-hidden="true" /> : null}{submitting ? "Creating your account…" : "Create account"}{!submitting ? <ArrowRight size={17} aria-hidden="true" /> : null}</button>
    </form> : null}
    <p className={styles.modeSwitch}>Already have an account?<Link href="/login">Sign in<ArrowRight size={14} aria-hidden="true" /></Link></p>
  </section></AuthFrame>
}

"use client"

import { type FormEvent, useEffect, useRef, useState } from "react"
import { ArrowRight, Check, Eye, EyeOff, GraduationCap, LoaderCircle, Mail, Palette, School, Users } from "lucide-react"
import { AuthFrame } from "@/components/auth-frame"
import { buildForgotPasswordPlan, normalizeAccessRequest, safeRedirectPath } from "@/lib/auth-entry"
import styles from "@/components/auth-surface.module.css"

const demoAccounts = [
  { label: "Admin", identifier: "admin", password: "Admin123456!" },
  { label: "Learner", identifier: "learner", password: "Learn123456!" },
]

const requestRoles = [
  { label: "Learner", value: "learner", Icon: GraduationCap },
  { label: "Teacher", value: "teacher", Icon: School },
  { label: "Team lead", value: "team", Icon: Users },
  { label: "Creator", value: "creator", Icon: Palette },
]

type AccessMode = "request" | "signin"

export function LoginSurface() {
  const [mode, setMode] = useState<AccessMode>("signin")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [requestName, setRequestName] = useState("")
  const [requestEmail, setRequestEmail] = useState("")
  const [requestGoal, setRequestGoal] = useState("")
  const [requestRole, setRequestRole] = useState("learner")
  const [error, setError] = useState("")
  const [requestSent, setRequestSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [redirectPath, setRedirectPath] = useState("/dashboard")
  const pending = useRef(false)
  const canSignIn = Boolean(identifier.trim() && password)
  const requestValidation = normalizeAccessRequest({ email: requestEmail, goal: requestGoal, name: requestName, role: requestRole })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setRedirectPath(safeRedirectPath(params.get("redirect")))
    if (params.get("mode") === "request") setMode("request")
  }, [])

  function changeMode(nextMode: AccessMode) {
    if (pending.current) return
    setMode(nextMode)
    setError("")
    setRequestSent(false)
    setForgotOpen(false)
    setShowPassword(false)
    const url = new URL(window.location.href)
    if (nextMode === "request") url.searchParams.set("mode", "request")
    else url.searchParams.delete("mode")
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }

  function applyDemoAccount(account: (typeof demoAccounts)[number]) {
    if (pending.current) return
    setIdentifier(account.identifier)
    setPassword(account.password)
    setError("")
    setForgotOpen(false)
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current || !canSignIn) return
    pending.current = true
    setLoading(true)
    setError("")
    setForgotOpen(false)
    let navigating = false
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(json.error || "Unable to sign in.")
        return
      }
      window.location.href = redirectPath
      navigating = true
    } catch {
      setError("Unable to connect. Please try again.")
    } finally {
      if (!navigating) {
        pending.current = false
        setLoading(false)
      }
    }
  }

  async function handleAccessRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current || !requestValidation.ok || requestSent) return
    pending.current = true
    setLoading(true)
    setError("")
    setForgotOpen(false)
    try {
      const response = await fetch("/api/auth/signup-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: requestEmail, goal: requestGoal, name: requestName, role: requestRole }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(json.error || "Unable to send your request.")
        return
      }
      setRequestSent(true)
      setRequestGoal("")
    } catch {
      setError("Unable to connect. Your details are still here — try again.")
    } finally {
      pending.current = false
      setLoading(false)
    }
  }

  return <AuthFrame>
    <section className={styles.formPanel} aria-labelledby="auth-heading">
      {requestSent ? <div className={styles.successPanel}>
        <span className={styles.successSymbol}><Check size={30} strokeWidth={2.5} aria-hidden="true" /></span>
        <div role="status"><p className={styles.eyebrow}>Request received</p><h1 id="auth-heading">You’re on the list.</h1><p className={styles.description}>An admin will review your request. An invitation is needed to create your account.</p></div>
        <span className={styles.emailReceipt}><Mail size={16} aria-hidden="true" />{requestEmail}</span>
        <button type="button" className={styles.primaryButton} onClick={() => changeMode("signin")}>Back to sign in<ArrowRight size={17} aria-hidden="true" /></button>
      </div> : <>
        <div className={styles.formHeading}>
          <p className={styles.eyebrow}>{mode === "signin" ? "Your workspace awaits" : "A little about you"}</p>
          <h1 id="auth-heading">{mode === "signin" ? "Welcome back." : "Start something good."}</h1>
          <p className={styles.description}>{mode === "signin" ? "Pick up where your ideas left off." : "Request an invite to your new workspace."}</p>
        </div>
        {mode === "signin" ? <form onSubmit={handleSignIn} className={styles.form} aria-busy={loading}>
          <label className={styles.field}>Username or email<input required autoComplete="username" value={identifier} disabled={loading} onChange={(event) => setIdentifier(event.target.value)} placeholder="you@example.com" /></label>
          <div className={styles.field}>
            <div className={styles.labelRow}><label htmlFor="signin-password">Password</label><button type="button" aria-expanded={forgotOpen} aria-controls="password-help" onClick={() => setForgotOpen(!forgotOpen)} disabled={loading} className={styles.textButton}>Forgot password?</button></div>
            <div className={styles.passwordField}><input id="signin-password" required type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} disabled={loading} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /><button type="button" className={styles.passwordToggle} disabled={loading} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div>
          </div>
          {forgotOpen ? <p id="password-help" className={styles.notice}>{buildForgotPasswordPlan(identifier).nextAction}</p> : null}
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
          <button type="submit" disabled={loading || !canSignIn} className={styles.primaryButton}>{loading ? <LoaderCircle size={17} className={styles.spinner} aria-hidden="true" /> : null}{loading ? "Signing in…" : "Sign in"}{!loading ? <ArrowRight size={17} aria-hidden="true" /> : null}</button>
          <details className={styles.demo}><summary>Explore with a demo</summary><div className={styles.demoOptions}>{demoAccounts.map((account) => <button key={account.identifier} type="button" disabled={loading} onClick={() => applyDemoAccount(account)}>Use {account.label}<ArrowRight size={14} aria-hidden="true" /></button>)}</div></details>
        </form> : <form onSubmit={handleAccessRequest} className={styles.form} aria-busy={loading}>
          <label className={styles.field}>Name<input required minLength={2} maxLength={120} autoComplete="name" disabled={loading} value={requestName} onChange={(event) => setRequestName(event.target.value)} placeholder="Your name" /></label>
          <label className={styles.field}>Email<input required type="email" maxLength={254} autoComplete="email" disabled={loading} value={requestEmail} onChange={(event) => setRequestEmail(event.target.value)} placeholder="you@example.com" /></label>
          <fieldset className={styles.roleField}><legend>I’m a…</legend><div className={styles.roleOptions}>{requestRoles.map(({ value, label, Icon }) => <label key={value} className={styles.roleOption}><input type="radio" name="role" value={value} checked={requestRole === value} disabled={loading} onChange={() => setRequestRole(value)} /><span><Icon size={16} aria-hidden="true" />{label}</span></label>)}</div></fieldset>
          <label className={styles.field}>What’s on your mind?<textarea required minLength={12} maxLength={600} rows={2} disabled={loading} value={requestGoal} onChange={(event) => setRequestGoal(event.target.value)} placeholder="Something you want to learn or create…" /><span className={styles.fieldHint}>A short learning goal · 12 characters minimum</span></label>
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
          <button type="submit" disabled={loading || !requestValidation.ok} className={styles.primaryButton}>{loading ? <LoaderCircle size={17} className={styles.spinner} aria-hidden="true" /> : null}{loading ? "Sending…" : "Request an invite"}{!loading ? <ArrowRight size={17} aria-hidden="true" /> : null}</button>
          <p className={styles.approvalNote}>Invitations are reviewed by an admin.</p>
        </form>}
        <p className={styles.modeSwitch}>{mode === "signin" ? "New here?" : "Already have an account?"}<button type="button" disabled={loading} onClick={() => changeMode(mode === "signin" ? "request" : "signin")}>{mode === "signin" ? "Request access" : "Sign in"}<ArrowRight size={14} aria-hidden="true" /></button></p>
      </>}
    </section>
  </AuthFrame>
}

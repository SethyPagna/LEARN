"use client"

import { type FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { ArrowRight, Eye, EyeOff, Moon, Sun } from "lucide-react"
import { buildForgotPasswordPlan, safeRedirectPath } from "@/lib/auth-entry"
import { applyLocaleToDocument, readStoredLocale, writeStoredLocale } from "@/lib/i18n/locale-storage"
import { languageNames, supportedLocales, type SupportedLocale } from "@/lib/i18n/vocabulary"

const demoAccounts = [
  { label: "Admin", identifier: "admin", password: "Admin123456!", detail: "Full provider, audit, and workspace controls." },
  { label: "Learner", identifier: "learner", password: "Learn123456!", detail: "Clean learner workspace for daily study." },
]

const requestRoles = [
  { label: "Learner", value: "learner" },
  { label: "Teacher", value: "teacher" },
  { label: "Team lead", value: "team" },
  { label: "Creator", value: "creator" },
]

export function LoginSurface() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mode, setMode] = useState<"request" | "signin">("signin")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [requestName, setRequestName] = useState("")
  const [requestEmail, setRequestEmail] = useState("")
  const [requestGoal, setRequestGoal] = useState("")
  const [requestRole, setRequestRole] = useState("learner")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  const [locale, setLocaleState] = useState<SupportedLocale>("en")
  const [mounted, setMounted] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [redirectPath, setRedirectPath] = useState("/dashboard")
  const forgotPlan = buildForgotPasswordPlan(identifier)
  const currentTheme = mounted ? resolvedTheme : "dark"
  const nextTheme = currentTheme === "dark" ? "light" : "dark"
  const ThemeIcon = currentTheme === "dark" ? Sun : Moon
  const canSignIn = Boolean(identifier.trim() && password)
  const canRequestAccess = Boolean(requestName.trim().length >= 2 && requestEmail.trim() && requestGoal.trim().length >= 12)

  useEffect(() => {
    setMounted(true)
    setLocaleState(readStoredLocale())
    const params = new URLSearchParams(window.location.search)
    setRedirectPath(safeRedirectPath(params.get("redirect")))
  }, [])

  useEffect(() => {
    applyLocaleToDocument(locale)
  }, [locale])

  function setLocale(nextLocale: SupportedLocale) {
    setLocaleState(nextLocale)
    writeStoredLocale(nextLocale)
  }

  function applyDemoAccount(account: (typeof demoAccounts)[number]) {
    setMode("signin")
    setIdentifier(account.identifier)
    setPassword(account.password)
    setError("")
    setSuccess("")
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")
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
    } catch {
      setError("Unable to connect. Check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  function handleForgotPassword() {
    const resetPlan = buildForgotPasswordPlan(identifier)
    setForgotOpen(true)
    setError(resetPlan.tone === "watch" ? resetPlan.nextAction : "")
    setSuccess(resetPlan.tone === "neutral" ? resetPlan.nextAction : "")
  }

  async function handleAccessRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")
    try {
      const response = await fetch("/api/auth/signup-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: requestEmail, goal: requestGoal, name: requestName, role: requestRole }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(json.error || "Unable to save the request.")
        return
      }
      setSuccess(json.message || "Access request saved.")
      setRequestGoal("")
    } catch {
      setError("Unable to send your request. Check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-surface grid min-h-dvh place-items-center bg-background px-4 py-10 text-foreground">
    <section className="w-full max-w-[420px] rounded-xl border border-border bg-card p-6 sm:p-8">
      <header className="mb-7 flex items-center justify-between gap-3"><Link href="/" aria-label="Go to LEARN intro" className="flex items-center gap-2.5 text-sm font-semibold"><img loading="eager" src="/icon.svg" alt="" width={32} height={32} />LEARN</Link><div className="flex items-center gap-1"><button type="button" onClick={() => setTheme(nextTheme)} aria-label={nextTheme === "light" ? "Light mode" : "Dark mode"} className="editor-command !px-2"><ThemeIcon className="h-4 w-4" /></button><select aria-label="Language" value={locale} onChange={(event) => setLocale(event.target.value as SupportedLocale)} className="max-w-24 rounded-md bg-transparent py-2 text-xs">{supportedLocales.map((value) => <option key={value} value={value}>{languageNames[value]}</option>)}</select></div></header>
      <h1 className="text-2xl font-semibold tracking-tight">{mode === "signin" ? "Sign in to LEARN" : "Request access"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{mode === "signin" ? "Your projects, notes and learning in one place." : "Tell us a little about what you want to learn."}</p>
      <nav aria-label="Account access" className="workspace-tabs mt-5">{(["signin", "request"] as const).map((value) => <button key={value} type="button" aria-current={mode === value ? "page" : undefined} className={`workspace-tab ${mode === value ? "is-active" : ""}`} onClick={() => { setMode(value); setError(""); setSuccess("") }}>{value === "signin" ? "Sign in" : "Request access"}</button>)}</nav>
      {mode === "signin" ? <form onSubmit={handleSignIn} className="mt-5 grid gap-4">
        <label className="editor-field">Username or email<input required autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} className="editor-input" placeholder="Your username or email" /></label>
        <label className="editor-field">Password<span className="flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring"><input required aria-label="Password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none" /><button type="button" className="editor-command !px-3" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
        <button type="button" onClick={handleForgotPassword} className="justify-self-start text-xs text-muted-foreground hover:text-foreground">Forgot password?</button>
        {forgotOpen ? <p className="rounded-md bg-secondary p-3 text-xs leading-5">{forgotPlan.nextAction}</p> : null}
        <button type="submit" disabled={loading || !canSignIn} className="editor-primary !min-h-10">{loading ? "Signing in…" : "Open workspace"}<ArrowRight className="h-4 w-4" /></button>
        <details className="border-t border-border pt-3 text-xs"><summary className="cursor-pointer py-1 text-muted-foreground">Try a demo account</summary><div className="mt-2 flex gap-2">{demoAccounts.map((account) => <button key={account.identifier} type="button" className="editor-command border border-border" onClick={() => applyDemoAccount(account)}>Use {account.label}</button>)}</div></details>
      </form> : <form onSubmit={handleAccessRequest} className="mt-5 grid gap-4">
        <label className="editor-field">Name<input required autoComplete="name" value={requestName} onChange={(event) => setRequestName(event.target.value)} className="editor-input" /></label>
        <label className="editor-field">Email<input required type="email" autoComplete="email" value={requestEmail} onChange={(event) => setRequestEmail(event.target.value)} className="editor-input" /></label>
        <label className="editor-field">Role<select value={requestRole} onChange={(event) => setRequestRole(event.target.value)} className="editor-input">{requestRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
        <label className="editor-field">What would you like to learn?<textarea required minLength={12} value={requestGoal} onChange={(event) => setRequestGoal(event.target.value)} className="editor-input min-h-24" /></label>
        <button type="submit" disabled={loading || !canRequestAccess} className="editor-primary !min-h-10">{loading ? "Sending…" : "Request access"}</button>
      </form>}
      {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}
      {success && !forgotOpen ? <p role="status" className="mt-4 text-sm text-success">{success}</p> : null}
    </section>
  </main>
}

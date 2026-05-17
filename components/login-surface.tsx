"use client"

import { type FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import {
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Languages,
  LockKeyhole,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  UserPlus,
} from "lucide-react"
import { buildAuthEntryPlan, buildForgotPasswordPlan, safeRedirectPath } from "@/lib/auth-entry"
import { isSupportedLocale, languageNames, supportedLocales, type SupportedLocale } from "@/lib/i18n/vocabulary"

const LANGUAGE_KEY = "learn_locale"

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

function getStoredLocale(): SupportedLocale {
  if (typeof window === "undefined") return "en"
  const storedLocale = window.localStorage.getItem(LANGUAGE_KEY) || ""
  return isSupportedLocale(storedLocale) ? storedLocale : "en"
}

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
  const [languageOpen, setLanguageOpen] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [redirectPath, setRedirectPath] = useState("/dashboard")
  const plan = useMemo(
    () => buildAuthEntryPlan({ accessRequestStatus: success ? "success" : error ? "error" : "idle", identifier, mode, password }),
    [error, identifier, mode, password, success],
  )
  const forgotPlan = useMemo(() => buildForgotPasswordPlan(identifier), [identifier])
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark"
  const ThemeIcon = resolvedTheme === "dark" ? Sun : Moon

  useEffect(() => {
    setLocaleState(getStoredLocale())
    const params = new URLSearchParams(window.location.search)
    setRedirectPath(safeRedirectPath(params.get("redirect")))
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr"
  }, [locale])

  function setLocale(nextLocale: SupportedLocale) {
    setLocaleState(nextLocale)
    window.localStorage.setItem(LANGUAGE_KEY, nextLocale)
    window.dispatchEvent(new Event("learn:locale-change"))
    setLanguageOpen(false)
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
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    })
    const json = await response.json().catch(() => ({}))
    setLoading(false)
    if (!response.ok) {
      setError(json.error || "Unable to sign in.")
      return
    }
    window.location.href = redirectPath
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
    const response = await fetch("/api/auth/signup-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: requestEmail, goal: requestGoal, name: requestName, role: requestRole }),
    })
    const json = await response.json().catch(() => ({}))
    setLoading(false)
    if (!response.ok) {
      setError(json.error || "Unable to save the request.")
      return
    }
    setSuccess(json.message || "Access request saved.")
    setRequestGoal("")
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f7fb] text-slate-950 dark:bg-[#03070d] dark:text-white">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-0 px-4 py-4 lg:grid-cols-[0.95fr_1.05fr] lg:px-6 lg:py-6">
        <section className="hidden min-w-0 flex-col justify-between rounded-[28px] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 dark:border-white/10 dark:bg-white/[0.045] dark:shadow-black/30 lg:flex">
          <Link href="/" className="flex w-fit items-center gap-3 rounded-xl transition hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500" aria-label="Go to LEARN intro">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <BookOpen className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">LEARN</span>
              <span className="block text-xs text-slate-500 dark:text-white/52">Workspace access</span>
            </span>
          </Link>

          <div className="py-10">
            <h1 className="max-w-2xl text-5xl font-semibold leading-[1.02] tracking-tight">
              One calm door into your learning system.
            </h1>
            <div className="mt-8 grid gap-3">
              {[
                ["Private by default", "Vault work, files, and provider keys stay behind authenticated sessions.", ShieldCheck],
                ["Quick to resume", "Open the last workspace, continue Studio drafts, or jump into reviews.", Sparkles],
                ["Admin-ready", "Access requests land in audit activity for review instead of open public signup.", LockKeyhole],
              ].map(([title, detail, Icon]) => (
                <div key={String(title)} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/24">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-300/12 dark:text-emerald-200">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{String(title)}</span>
                    <span className="mt-1 block text-sm leading-6 text-slate-500 dark:text-white/55">{String(detail)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/24">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-white/42">Sample accounts</p>
            <div className="mt-3 grid gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.identifier}
                  type="button"
                  onClick={() => applyDemoAccount(account)}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-white/10 dark:bg-white/[0.045] dark:hover:border-emerald-300/50 dark:hover:bg-emerald-300/10"
                >
                  <span>
                    <span className="block text-sm font-semibold">{account.label}</span>
                    <span className="block text-xs text-slate-500 dark:text-white/50">{account.detail}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-w-0 items-center justify-center py-4 lg:py-0 lg:pl-6">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-200/70 dark:border-white/10 dark:bg-[#0b111b] dark:shadow-black/40 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <Link href="/" className="flex min-w-0 items-center gap-3 rounded-xl transition hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500" aria-label="Go to LEARN intro">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                  <BookOpen className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">LEARN</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-white/52">Secure workspace</span>
                </span>
              </Link>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTheme(nextTheme)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-white/10 dark:bg-white/[0.055] dark:text-white/78 dark:hover:border-emerald-300/50"
                  aria-label={nextTheme === "light" ? "Light mode" : "Dark mode"}
                  title={nextTheme === "light" ? "Light mode" : "Dark mode"}
                >
                  <ThemeIcon className="h-4 w-4" />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setLanguageOpen((open) => !open)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-white/10 dark:bg-white/[0.055] dark:text-white/78 dark:hover:border-emerald-300/50"
                    aria-expanded={languageOpen}
                    aria-label="Language"
                    title={languageNames[locale]}
                  >
                    <Languages className="h-4 w-4" />
                  </button>
                  {languageOpen ? (
                    <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 text-slate-950 shadow-2xl dark:border-white/12 dark:bg-[#101722] dark:text-white">
                      <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/48">Language</p>
                      <div className="grid max-h-72 gap-1 overflow-auto pr-1">
                        {supportedLocales.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setLocale(item)}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-emerald-50 hover:text-emerald-900 dark:hover:bg-white/8 dark:hover:text-white ${
                              locale === item ? "bg-emerald-600 text-white dark:bg-emerald-300 dark:text-slate-950" : "text-slate-700 dark:text-white/78"
                            }`}
                          >
                            <span>{languageNames[item]}</span>
                            {locale === item ? <Check className="h-4 w-4" /> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-black/28">
              {[
                ["signin", "Sign in", LockKeyhole],
                ["request", "Request access", UserPlus],
              ].map(([value, label, Icon]) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => {
                    setMode(value as "request" | "signin")
                    setError("")
                    setSuccess("")
                  }}
                  className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${
                    mode === value ? "bg-white text-slate-950 shadow-sm dark:bg-white dark:text-slate-950" : "text-slate-500 hover:text-slate-950 dark:text-white/56 dark:hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {String(label)}
                </button>
              ))}
            </div>

            <div className={`mt-4 rounded-2xl border p-4 ${plan.tone === "good" ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-emerald-100" : plan.tone === "watch" ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100" : "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.045] dark:text-white/70"}`}>
              <p className="text-sm font-semibold">{plan.label}</p>
              <p className="mt-1 text-sm opacity-80">{plan.nextAction}</p>
            </div>

            {mode === "signin" ? (
              <form onSubmit={handleSignIn} className="mt-5 grid gap-4">
                <label className="grid gap-2 text-sm font-semibold">
                  Username or email
                  <input
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    autoComplete="username"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white dark:border-white/10 dark:bg-white/[0.055] dark:text-white dark:focus:border-emerald-300"
                    placeholder="admin or learner"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  <span className="flex items-center justify-between gap-3">
                    <span>Password</span>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-white/55 dark:hover:bg-white/8 dark:hover:text-white"
                    >
                      Forgot?
                    </button>
                  </span>
                  <span className="flex h-12 items-center rounded-xl border border-slate-200 bg-slate-50 pr-2 transition focus-within:border-emerald-500 focus-within:bg-white dark:border-white/10 dark:bg-white/[0.055] dark:focus-within:border-emerald-300">
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      type={showPassword ? "text" : "password"}
                      className="h-full min-w-0 flex-1 bg-transparent px-4 text-sm font-medium text-slate-950 outline-none placeholder:text-slate-400 dark:text-white"
                      placeholder="Enter password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200 hover:text-slate-950 dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </span>
                </label>

                {forgotOpen ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-white/10 dark:bg-white/[0.045]">
                    <p className="font-semibold">{forgotPlan.label}</p>
                    <p className="mt-1 text-slate-500 dark:text-white/55">{forgotPlan.nextAction}</p>
                  </div>
                ) : null}

                <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.045] lg:hidden">
                  <summary className="cursor-pointer text-sm font-semibold">Sample accounts</summary>
                  <div className="mt-3 grid gap-2">
                    {demoAccounts.map((account) => (
                      <button key={account.identifier} type="button" onClick={() => applyDemoAccount(account)} className="rounded-lg bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 dark:bg-white/8 dark:text-white">
                        Use {account.label}
                      </button>
                    ))}
                  </div>
                </details>

                {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-red-500/14 dark:text-red-100">{error}</p> : null}

                <button
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-emerald-300 dark:text-slate-950 dark:hover:bg-emerald-200"
                >
                  {loading ? "Signing in..." : "Open workspace"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleAccessRequest} className="mt-5 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold">
                    Name
                    <input value={requestName} onChange={(event) => setRequestName(event.target.value)} autoComplete="name" className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium outline-none transition focus:border-emerald-500 focus:bg-white dark:border-white/10 dark:bg-white/[0.055] dark:text-white dark:focus:border-emerald-300" placeholder="Your name" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Email
                    <input value={requestEmail} onChange={(event) => setRequestEmail(event.target.value)} autoComplete="email" className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium outline-none transition focus:border-emerald-500 focus:bg-white dark:border-white/10 dark:bg-white/[0.055] dark:text-white dark:focus:border-emerald-300" placeholder="you@example.com" />
                  </label>
                </div>
                <label className="grid gap-2 text-sm font-semibold">
                  Role
                  <select value={requestRole} onChange={(event) => setRequestRole(event.target.value)} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium outline-none transition focus:border-emerald-500 focus:bg-white dark:border-white/10 dark:bg-white/[0.055] dark:text-white dark:focus:border-emerald-300">
                    {requestRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  What do you want LEARN to help with?
                  <textarea value={requestGoal} onChange={(event) => setRequestGoal(event.target.value)} className="min-h-28 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none transition focus:border-emerald-500 focus:bg-white dark:border-white/10 dark:bg-white/[0.055] dark:text-white dark:focus:border-emerald-300" placeholder="Example: organize notes, generate practice, and track progress for operating systems." />
                </label>

                {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-red-500/14 dark:text-red-100">{error}</p> : null}
                {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-300/12 dark:text-emerald-100">{success}</p> : null}

                <button
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-emerald-300 dark:text-slate-950 dark:hover:bg-emerald-200"
                >
                  {loading ? "Saving request..." : "Request access"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

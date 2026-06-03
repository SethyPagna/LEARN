"use client"

import { type FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, BookOpen, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react"
import { normalizeInviteAcceptance } from "@/lib/auth-entry"

export function InviteAcceptanceSurface({ token }: { token: string }) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "accepted" | "error">("loading")
  const [message, setMessage] = useState("Checking invite...")
  const validation = useMemo(() => normalizeInviteAcceptance({ email, name, password, token }), [email, name, password, token])

  useEffect(() => {
    let active = true
    async function loadInvite() {
      const response = await fetch(`/api/invites/accept?token=${encodeURIComponent(token)}`)
      const json = await response.json().catch(() => ({}))
      if (!active) return
      if (!response.ok) {
        setStatus("error")
        setMessage(json.error || "Invite could not be loaded.")
        return
      }
      setEmail(String(json.invite?.email || ""))
      setStatus(json.invite?.ready ? "ready" : "error")
      setMessage(json.invite?.ready ? "Invite ready. Create your password to enter LEARN." : "Invite is no longer active.")
    }
    loadInvite()
    return () => {
      active = false
    }
  }, [token])

  async function acceptInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validation.ok) {
      setStatus("error")
      setMessage(validation.error)
      return
    }
    setStatus("loading")
    setMessage("Creating your workspace session...")
    const response = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validation.value),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      setStatus("error")
      setMessage(json.error || "Unable to accept invite.")
      return
    }
    setStatus("accepted")
    setMessage("Invite accepted. Opening your dashboard...")
    window.location.href = "/dashboard?onboarding=1"
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 text-slate-950 dark:bg-[#03070d] dark:text-white">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-200/70 dark:border-white/10 dark:bg-[#0b111b] dark:shadow-black/40 lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="hidden min-h-[520px] flex-col justify-between bg-slate-950 p-8 text-white dark:bg-black lg:flex">
            <Link href="/" className="flex w-fit items-center gap-3 rounded-xl transition hover:opacity-80">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-950">
                <BookOpen className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">LEARN</span>
                <span className="block text-xs text-white/52">Invite setup</span>
              </span>
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Private by default</p>
              <h1 className="mt-3 text-5xl font-semibold leading-[1.02] tracking-tight">Join the workspace with a clean account path.</h1>
              <div className="mt-8 grid gap-3">
                {[
                  ["Verified link", "Only active invite tokens can create a session.", KeyRound],
                  ["One workspace", "Your account joins the LEARN workspace without exposing sibling apps.", ShieldCheck],
                  ["Ready to continue", "After setup, you land in Dashboard for first-run onboarding.", CheckCircle2],
                ].map(([title, body, Icon]) => (
                  <div key={String(title)} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" />
                    <span>
                      <span className="block text-sm font-semibold">{String(title)}</span>
                      <span className="mt-1 block text-sm leading-6 text-white/58">{String(body)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <form onSubmit={acceptInvite} className="grid gap-5 p-5 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <Link href="/" className="flex items-center gap-3 rounded-xl transition hover:opacity-80 lg:hidden">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                  <BookOpen className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold">LEARN</span>
              </Link>
              <Link href="/login" className="ml-auto rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/8">
                Sign in
              </Link>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-200">Workspace invite</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Set up your LEARN access.</h2>
            </div>

            <div className={`rounded-2xl border p-4 text-sm font-semibold ${
              status === "accepted" || status === "ready"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-emerald-100"
                : status === "error"
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-300/30 dark:bg-red-500/12 dark:text-red-100"
                  : "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.055] dark:text-white/68"
            }`}>
              {message}
            </div>

            <label className="grid gap-2 text-sm font-semibold">
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 outline-none transition focus:border-emerald-500 focus:bg-white dark:border-white/10 dark:bg-white/[0.055] dark:text-white dark:focus:border-emerald-300" />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 outline-none transition focus:border-emerald-500 focus:bg-white dark:border-white/10 dark:bg-white/[0.055] dark:text-white dark:focus:border-emerald-300" placeholder="Your name" />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Password
              <input value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" type="password" className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 outline-none transition focus:border-emerald-500 focus:bg-white dark:border-white/10 dark:bg-white/[0.055] dark:text-white dark:focus:border-emerald-300" placeholder="At least 10 characters" />
            </label>

            <button disabled={status === "loading" || status === "accepted"} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-emerald-300 dark:text-slate-950 dark:hover:bg-emerald-200">
              {status === "loading" ? "Checking..." : "Accept invite"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}

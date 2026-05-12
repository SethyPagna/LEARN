"use client"

import { useState } from "react"
import { ArrowRight, BookOpen, Brain, Database, Lock, Sparkles } from "lucide-react"

export function LoginSurface() {
  const [identifier, setIdentifier] = useState("admin")
  const [password, setPassword] = useState("Admin123456!")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")
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
    window.location.href = "/dashboard"
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#171717]">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-between px-6 py-8 sm:px-10 lg:px-14">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#171717] text-white">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Learning OS</p>
              <p className="text-xs text-[#6b6257]">Personal study workspace</p>
            </div>
          </div>

          <div className="max-w-2xl py-16">
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.02] tracking-normal sm:text-6xl">
              One calm place for notes, quizzes, goals, and AI tutoring.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-[#625a51]">
              A mature learning workspace with database-backed notes, adaptive practice, progress memory, and provider-ready AI.
            </p>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                ["Notion-like notes", Brain],
                ["Postgres memory", Database],
                ["Private sessions", Lock],
              ].map(([label, Icon]) => (
                <div key={String(label)} className="rounded-2xl border border-[#ded6c9] bg-white/70 p-4 shadow-sm">
                  <Icon className="h-5 w-5 text-[#276956]" />
                  <p className="mt-3 text-sm font-medium">{String(label)}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-[#6b6257]">Docker, Vercel, and Cloudflare try-run paths are included.</p>
        </section>

        <section className="flex items-center justify-center bg-[#171717] p-6 text-white lg:p-10">
          <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
            <div className="mb-8">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d7ff6f] text-[#171717]">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-semibold">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-white/62">
                Demo admin is prefilled. Runtime secrets stay outside the repo.
              </p>
            </div>

            <label className="text-xs font-medium uppercase tracking-[0.18em] text-white/50">Username or email</label>
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-white/12 bg-white/10 px-4 text-sm outline-none transition focus:border-[#d7ff6f]"
            />

            <label className="mt-5 block text-xs font-medium uppercase tracking-[0.18em] text-white/50">Password</label>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className="mt-2 h-12 w-full rounded-xl border border-white/12 bg-white/10 px-4 text-sm outline-none transition focus:border-[#d7ff6f]"
            />

            {error ? <p className="mt-4 rounded-xl bg-red-500/16 px-4 py-3 text-sm text-red-100">{error}</p> : null}

            <button
              disabled={loading}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#d7ff6f] text-sm font-semibold text-[#171717] transition hover:bg-[#e2ff91] disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Open workspace"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}

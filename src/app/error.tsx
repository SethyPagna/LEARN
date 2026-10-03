"use client"

import { useEffect } from "react"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Route error:", error)
  }, [error])

  return (
    <main className="grid min-h-[100svh] place-items-center bg-[#f6faf7] px-5 py-10 text-slate-950 dark:bg-[#040506] dark:text-white">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/5">
        <h1 className="text-xl font-semibold tracking-tight">This screen hit an error</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-white/60">
          The page could not finish rendering. Trying again usually clears it.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-slate-400 dark:text-white/40">Reference: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-white/90"
        >
          Try again
        </button>
      </div>
    </main>
  )
}

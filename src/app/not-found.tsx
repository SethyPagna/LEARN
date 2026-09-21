import Link from "next/link"

export default function NotFound() {
  return (
    <main className="grid min-h-[100svh] place-items-center bg-[#f6faf7] px-5 py-10 text-slate-950 dark:bg-[#040506] dark:text-white">
      <div className="w-full max-w-md text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-white/50">404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">We could not find that page</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-white/60">
          The link may be old, mistyped, or pointing at something you no longer have access to.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-white/90"
        >
          Back to LEARN
        </Link>
      </div>
    </main>
  )
}

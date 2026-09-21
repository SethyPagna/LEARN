export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="grid min-h-[100svh] place-items-center bg-[#f6faf7] px-5 py-10 dark:bg-[#040506]"
    >
      <div className="w-full max-w-md animate-pulse space-y-3">
        <div className="h-8 w-40 rounded-xl bg-slate-300/70 dark:bg-white/10" />
        <div className="h-4 w-full rounded bg-slate-200/80 dark:bg-white/5" />
        <div className="h-4 w-5/6 rounded bg-slate-200/80 dark:bg-white/5" />
        <div className="h-24 w-full rounded-2xl bg-slate-200/70 dark:bg-white/5" />
        <span className="sr-only">Loading</span>
      </div>
    </main>
  )
}

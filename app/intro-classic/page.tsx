import { cookies } from "next/headers"
import Link from "next/link"
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react"
import { IntroWorkflow } from "@/components/intro-workflow"
import { PublicIntroControls } from "@/components/public-intro-controls"
import { SESSION_COOKIE } from "@/lib/data"

export default async function ClassicIntroPage() {
  const cookieStore = await cookies()
  const signedIn = Boolean(cookieStore.get(SESSION_COOKIE)?.value)

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6faf7] text-slate-950 dark:bg-[#040506] dark:text-white">
      <section className="relative isolate grid min-h-screen content-center px-5 py-4 sm:px-8">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_14%,rgba(14,165,233,0.18),transparent_28%),radial-gradient(circle_at_78%_20%,rgba(16,185,129,0.16),transparent_24%),linear-gradient(135deg,#f8fbff_0%,#eaf7f0_54%,#f6faf7_100%)] dark:bg-[radial-gradient(circle_at_18%_14%,rgba(96,165,250,0.22),transparent_28%),radial-gradient(circle_at_78%_20%,rgba(16,185,129,0.18),transparent_24%),linear-gradient(135deg,#040506_0%,#08111f_54%,#040506_100%)]" />
        <nav className="mx-auto mb-5 flex w-full max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-lg shadow-emerald-300/10 dark:bg-white dark:text-black">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.18em]">LEARN</p>
              <p className="text-xs text-slate-500 dark:text-white/50">Classic intro backup</p>
            </div>
          </div>
          <PublicIntroControls signedIn={signedIn} />
        </nav>

        <div className="mx-auto grid w-full max-w-7xl gap-6">
          <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-300/70 bg-white/70 px-3 py-1 text-sm font-semibold text-slate-700 transition hover:border-emerald-400 hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white/68 dark:hover:border-emerald-300/45">
            <ArrowLeft className="h-4 w-4" />
            New intro version
          </Link>
          <div className="max-w-3xl">
            <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
              Classic LEARN workflow.
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-slate-600 dark:text-white/64">
              This route keeps the previous scroll workflow available while the new design version becomes the main public intro.
            </p>
            <a href="#workflow" className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 dark:bg-white dark:text-black dark:hover:bg-emerald-100">
              View classic workflow
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>
      <IntroWorkflow />
    </main>
  )
}

"use client"

import type React from "react"
import { Play } from "lucide-react"

export function PublicWorkflowLink() {
  function openWorkflow(event: React.MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById("workflow")
    if (!target) return
    event.preventDefault()
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })
  }

  return (
    <a
      href="#workflow"
      onClick={openWorkflow}
      className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-300/80 bg-white/50 px-4 text-sm font-semibold text-slate-800 shadow-sm shadow-slate-950/5 transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-emerald-400/60 hover:bg-white hover:shadow-md active:scale-[0.98] dark:border-white/14 dark:bg-transparent dark:text-white/82 dark:shadow-black/20 dark:hover:bg-white/10"
    >
      <Play className="h-4 w-4" />
      View workflow
    </a>
  )
}

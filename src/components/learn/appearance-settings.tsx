"use client"

import { Check } from "lucide-react"
import { useAppearanceMode } from "@/components/use-appearance-mode"
import { ThemeModeSwitcher } from "@/components/theme-mode-switcher"
import type { WorkspaceOptions } from "./preferences"

const accents = [
  { id: "ink", label: "Ink", color: "#5365c1" },
  { id: "teal", label: "Forest", color: "#127666" },
  { id: "sky", label: "Ocean", color: "#167ca6" },
  { id: "violet", label: "Iris", color: "#7952ba" },
  { id: "rose", label: "Rose", color: "#b54464" },
  { id: "amber", label: "Ochre", color: "#a36115" },
] as const

export function AppearanceSettings({ options, setOptions }: { options: WorkspaceOptions; setOptions: (options: Partial<WorkspaceOptions>) => void }) {
  const { mode } = useAppearanceMode()
  return <div className="space-y-5">
    <p className="sr-only">Appearance changes save on this browser.</p>
    <fieldset><legend className="mb-3 text-sm font-medium">Appearance</legend><ThemeModeSwitcher previews /></fieldset>
    {mode === "color" && <fieldset><legend className="mb-3 text-sm font-medium">Accent</legend><div className="flex flex-wrap gap-2">{accents.map((accent) => <button key={accent.id} type="button" aria-label={`${accent.label} accent`} title={accent.label} aria-pressed={options.appAccent === accent.id} onClick={() => setOptions({ appAccent: accent.id })} className={`flex h-11 w-11 items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:ring-ring ${options.appAccent === accent.id ? "border-primary bg-accent" : "border-transparent hover:bg-secondary"}`}><span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: accent.color }}>{options.appAccent === accent.id ? <Check className="h-4 w-4" /> : null}</span></button>)}</div></fieldset>}
    <details className="workspace-disclosure"><summary>Personalize</summary><div className="grid max-w-2xl gap-4 pt-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Workspace name<input value={options.workspaceName} maxLength={80} onChange={(event) => setOptions({ workspaceName: event.target.value })} className="mt-2 block h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Your personal studio" /></label>
      <label className="text-sm font-medium">Today's focus<input value={options.dailyFocus} maxLength={160} onChange={(event) => setOptions({ dailyFocus: event.target.value })} className="mt-2 block h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="One thing you'd like to explore" /></label>
    </div></details>
  </div>
}

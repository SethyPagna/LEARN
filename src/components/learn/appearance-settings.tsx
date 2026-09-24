"use client"

import { Monitor, Moon, Sun, Check } from "lucide-react"
import { useTheme } from "next-themes"
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
  const { theme, setTheme } = useTheme()
  return <div className="space-y-7">
    <div><h3 className="text-base font-semibold">A space that feels like you</h3><p className="mt-1 text-sm text-muted-foreground">Changes are saved on this browser as you go.</p></div>
    <fieldset><legend className="mb-3 text-sm font-medium">Appearance</legend><div className="grid max-w-xl grid-cols-3 gap-3">
      {[{ id: "light", label: "Light", icon: Sun }, { id: "dark", label: "Dark", icon: Moon }, { id: "system", label: "System", icon: Monitor }].map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={theme === id} onClick={() => setTheme(id)} className={`rounded-xl border p-3 text-left transition focus-visible:ring-2 focus-visible:ring-ring ${theme === id ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"}`}><span className={`mb-3 flex h-16 overflow-hidden rounded-md border border-border ${id === "dark" ? "bg-[#212121]" : id === "light" ? "bg-[#ffffff]" : "bg-[linear-gradient(90deg,#ffffff_50%,#212121_50%)]"}`} aria-hidden="true"><span className="m-2 w-4 rounded-sm bg-primary/35" /><span className="my-3 mr-2 flex-1 rounded-sm bg-primary/15" /></span><span className="flex items-center gap-2 text-xs font-medium"><Icon className="h-3.5 w-3.5" />{label}</span></button>)}
    </div></fieldset>
    <fieldset><legend className="mb-3 text-sm font-medium">Your accent</legend><div className="flex flex-wrap gap-3">{accents.map((accent) => <button key={accent.id} type="button" aria-pressed={options.appAccent === accent.id} onClick={() => setOptions({ appAccent: accent.id })} className={`flex min-w-16 flex-col items-center gap-2 rounded-xl border px-3 py-3 text-xs focus-visible:ring-2 focus-visible:ring-ring ${options.appAccent === accent.id ? "border-primary bg-accent" : "border-border hover:bg-secondary"}`}><span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: accent.color }}>{options.appAccent === accent.id ? <Check className="h-4 w-4" /> : null}</span>{accent.label}</button>)}</div></fieldset>
    <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Workspace name<input value={options.workspaceName} maxLength={80} onChange={(event) => setOptions({ workspaceName: event.target.value })} className="mt-2 block h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Your personal studio" /></label>
      <label className="text-sm font-medium">Today's focus<input value={options.dailyFocus} maxLength={160} onChange={(event) => setOptions({ dailyFocus: event.target.value })} className="mt-2 block h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="One thing you'd like to explore" /></label>
    </div>
  </div>
}

export type UiTone = "critical" | "neutral" | "primary" | "steady" | "watch"
export type UiControlSize = "compact" | "regular"

export function statusToneClasses(tone: UiTone = "neutral") {
  if (tone === "critical") return "border-destructive/40 bg-destructive/10 text-destructive"
  if (tone === "primary") return "border-primary/40 bg-primary/10 text-primary"
  if (tone === "steady") return "border-success/40 bg-success/10 text-success"
  if (tone === "watch") return "border-warning/45 bg-warning/15 text-warning-foreground dark:text-warning"
  return "border-border bg-background text-muted-foreground"
}

export function toneSurfaceClasses(tone: UiTone = "neutral") {
  if (tone === "critical") return "bg-destructive/10 text-destructive"
  if (tone === "primary") return "bg-primary/10 text-primary"
  if (tone === "steady") return "bg-success/10 text-success"
  if (tone === "watch") return "bg-warning/15 text-warning-foreground dark:text-warning"
  return "bg-secondary text-secondary-foreground"
}

export function controlButtonClasses(input: {
  active?: boolean
  destructive?: boolean
  size?: UiControlSize
} = {}) {
  const size = input.size === "compact" ? "h-9 px-2.5 text-xs" : "h-10 px-3 text-sm"
  const base = `${size} inline-flex items-center justify-center gap-2 rounded-md border font-semibold transition focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-55`
  if (input.destructive) return `${base} border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground`
  if (input.active) return `${base} border-primary bg-primary text-primary-foreground hover:opacity-90`
  return `${base} border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground`
}

export function menuSurfaceClasses() {
  return "rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-xl"
}

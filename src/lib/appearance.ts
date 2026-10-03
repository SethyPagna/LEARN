import type { WorkspaceOptions } from "./workspace-preferences"

export const themeModes = ["light", "dark", "color"] as const
export type ThemeMode = (typeof themeModes)[number]

export function resolveThemeMode(theme: string | undefined, systemTheme?: string): ThemeMode {
  if (theme === "system") return systemTheme === "dark" ? "dark" : "light"
  return themeModes.includes(theme as ThemeMode) ? theme as ThemeMode : "color"
}

export function applyAppearanceOptions(options: WorkspaceOptions) {
  const root = document.documentElement
  root.classList.toggle("learn-high-contrast", options.highContrast)
  root.classList.toggle("learn-reduced-motion", options.reducedMotion)
  root.classList.toggle("learn-dyslexia", options.dyslexiaFriendly)
  root.dataset.learnAccent = options.appAccent
}

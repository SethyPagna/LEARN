"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { resolveThemeMode } from "@/lib/appearance"

/** Theme-dependent markup must match the server until hydration completes. */
export function useAppearanceMode() {
  const { theme, systemTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return { mode: mounted ? resolveThemeMode(theme, systemTheme) : "color", setMode: setTheme }
}

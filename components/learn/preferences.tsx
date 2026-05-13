"use client"

import { useEffect, useMemo, useState } from "react"
import { useTheme } from "next-themes"
import { getVocabulary, type SupportedLocale } from "@/lib/i18n/vocabulary"

type Density = "compact" | "comfortable"

const LANGUAGE_KEY = "learn_locale"
const DENSITY_KEY = "learn_density"

function getStoredValue(key: string) {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem(key) || ""
}

export function useWorkspacePreferences() {
  const { resolvedTheme, setTheme, theme } = useTheme()
  const [locale, setLocaleState] = useState<SupportedLocale>("en")
  const [density, setDensityState] = useState<Density>("compact")

  useEffect(() => {
    const storedLocale = getStoredValue(LANGUAGE_KEY)
    if (storedLocale) setLocaleState(storedLocale as SupportedLocale)
    const storedDensity = getStoredValue(DENSITY_KEY)
    if (storedDensity === "comfortable") setDensityState("comfortable")
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr"
  }, [locale])

  function setLocale(nextLocale: SupportedLocale) {
    setLocaleState(nextLocale)
    if (typeof window !== "undefined") window.localStorage.setItem(LANGUAGE_KEY, nextLocale)
  }

  function setDensity(nextDensity: Density) {
    setDensityState(nextDensity)
    if (typeof window !== "undefined") window.localStorage.setItem(DENSITY_KEY, nextDensity)
  }

  const text = useMemo(() => getVocabulary(locale), [locale])

  return {
    density,
    locale,
    resolvedTheme,
    setDensity,
    setLocale,
    setTheme,
    text,
    theme,
  }
}

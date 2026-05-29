"use client"

import { useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { getVocabulary, isSupportedLocale, loadVocabulary, type SupportedLocale } from "@/lib/i18n/vocabulary"
import { WORKSPACE_OPTIONS_KEY, defaultWorkspaceOptions, parseStoredWorkspaceOptions, serializeWorkspaceOptions, type Density, type WorkspaceOptions } from "@/lib/workspace-preferences"

const LANGUAGE_KEY = "learn_locale"
const DENSITY_KEY = "learn_density"

export { defaultWorkspaceOptions }
export type { WorkspaceOptions }

function getStoredValue(key: string) {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem(key) || ""
}

export function useWorkspacePreferences() {
  const { resolvedTheme, setTheme, theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [locale, setLocaleState] = useState<SupportedLocale>("en")
  const [text, setText] = useState(() => getVocabulary("en"))
  const [density, setDensityState] = useState<Density>("compact")
  const [options, setOptionsState] = useState<WorkspaceOptions>(defaultWorkspaceOptions)
  const optionsSaveTimeout = useRef<number | null>(null)
  const pendingOptionsSnapshot = useRef("")

  useEffect(() => {
    setMounted(true)
    const storedLocale = getStoredValue(LANGUAGE_KEY)
    if (isSupportedLocale(storedLocale)) setLocaleState(storedLocale)
    const storedDensity = getStoredValue(DENSITY_KEY)
    if (storedDensity === "comfortable") setDensityState("comfortable")
    const storedOptions = getStoredValue(WORKSPACE_OPTIONS_KEY)
    if (storedOptions) setOptionsState(parseStoredWorkspaceOptions(storedOptions))
  }, [])

  useEffect(() => {
    return () => {
      if (optionsSaveTimeout.current) {
        window.clearTimeout(optionsSaveTimeout.current)
        if (pendingOptionsSnapshot.current) {
          window.localStorage.setItem(WORKSPACE_OPTIONS_KEY, pendingOptionsSnapshot.current)
        }
      }
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr"
  }, [locale])

  useEffect(() => {
    let active = true
    setText(getVocabulary(locale))
    loadVocabulary(locale).then((nextText) => {
      if (active) setText(nextText)
    })
    return () => {
      active = false
    }
  }, [locale])

  useEffect(() => {
    document.documentElement.classList.toggle("learn-high-contrast", options.highContrast)
    document.documentElement.classList.toggle("learn-reduced-motion", options.reducedMotion)
    document.documentElement.classList.toggle("learn-dyslexia", options.dyslexiaFriendly)
    document.documentElement.dataset.learnAccent = options.appAccent
  }, [options.appAccent, options.highContrast, options.reducedMotion, options.dyslexiaFriendly])

  function setLocale(nextLocale: SupportedLocale) {
    setLocaleState(nextLocale)
    if (typeof window !== "undefined") window.localStorage.setItem(LANGUAGE_KEY, nextLocale)
  }

  function setDensity(nextDensity: Density) {
    setDensityState(nextDensity)
    if (typeof window !== "undefined") window.localStorage.setItem(DENSITY_KEY, nextDensity)
  }

  function setOptions(nextOptions: Partial<WorkspaceOptions>) {
    setOptionsState((current) => {
      const merged = { ...current, ...nextOptions }
      if (typeof window !== "undefined") {
        pendingOptionsSnapshot.current = serializeWorkspaceOptions(merged)
        if (optionsSaveTimeout.current) window.clearTimeout(optionsSaveTimeout.current)
        optionsSaveTimeout.current = window.setTimeout(() => {
          window.localStorage.setItem(WORKSPACE_OPTIONS_KEY, pendingOptionsSnapshot.current)
          optionsSaveTimeout.current = null
        }, 250)
      }
      return merged
    })
  }

  return {
    density,
    locale,
    options,
    resolvedTheme: mounted ? resolvedTheme : undefined,
    setDensity,
    setLocale,
    setOptions,
    setTheme,
    text,
    theme,
  }
}

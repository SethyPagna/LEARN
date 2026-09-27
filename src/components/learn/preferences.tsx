"use client"

import { useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { applyAppearanceOptions } from "@/lib/appearance"
import { applyLocaleToDocument, readStoredLocale, writeStoredLocale } from "@/lib/i18n/locale-storage"
import { getVocabulary, loadVocabulary, type SupportedLocale } from "@/lib/i18n/vocabulary"
import { WORKSPACE_OPTIONS_KEY, defaultWorkspaceOptions, parseStoredWorkspaceOptions, serializeWorkspaceOptions, type Density, type WorkspaceOptions } from "@/lib/workspace-preferences"

const DENSITY_KEY = "learn_density"

export { defaultWorkspaceOptions }
export type { WorkspaceOptions }

function getStoredValue(key: string) {
  if (typeof window === "undefined") return ""
  try { return window.localStorage.getItem(key) || "" } catch { return "" }
}

export function useWorkspacePreferences() {
  const { setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [locale, setLocaleState] = useState<SupportedLocale>("en")
  const [text, setText] = useState(() => getVocabulary("en"))
  const [density, setDensityState] = useState<Density>("compact")
  const [options, setOptionsState] = useState<WorkspaceOptions>(defaultWorkspaceOptions)
  const optionsRef = useRef<WorkspaceOptions>(defaultWorkspaceOptions)
  const unsavedOptions = useRef<Partial<WorkspaceOptions>>({})

  useEffect(() => {
    setMounted(true)
    setLocaleState(readStoredLocale())
    const storedDensity = getStoredValue(DENSITY_KEY)
    if (storedDensity === "comfortable") setDensityState("comfortable")
    const storedOptions = getStoredValue(WORKSPACE_OPTIONS_KEY)
    optionsRef.current = parseStoredWorkspaceOptions(storedOptions)
    setOptionsState(optionsRef.current)
  }, [])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== WORKSPACE_OPTIONS_KEY && event.key !== null) return
      optionsRef.current = { ...parseStoredWorkspaceOptions(getStoredValue(WORKSPACE_OPTIONS_KEY)), ...unsavedOptions.current }
      setOptionsState(optionsRef.current)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  useEffect(() => {
    applyLocaleToDocument(locale)
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
    if (mounted) applyAppearanceOptions(options)
  }, [mounted, options])

  function setLocale(nextLocale: SupportedLocale) {
    setLocaleState(nextLocale)
    writeStoredLocale(nextLocale)
  }

  function setDensity(nextDensity: Density) {
    setDensityState(nextDensity)
    if (typeof window !== "undefined") window.localStorage.setItem(DENSITY_KEY, nextDensity)
  }

  function setOptions(nextOptions: Partial<WorkspaceOptions>) {
    // Read the latest browser snapshot so another tab's unrelated edits survive.
    const stored = getStoredValue(WORKSPACE_OPTIONS_KEY)
    const current = stored ? parseStoredWorkspaceOptions(stored) : optionsRef.current
    const merged = { ...current, ...unsavedOptions.current, ...nextOptions }
    optionsRef.current = merged
    setOptionsState(merged)
    try {
      window.localStorage.setItem(WORKSPACE_OPTIONS_KEY, serializeWorkspaceOptions(merged))
      unsavedOptions.current = {}
    } catch {
      // Reads may still work when writes fail (for example, a full storage quota).
      unsavedOptions.current = { ...unsavedOptions.current, ...nextOptions }
    }
  }

  return {
    density,
    locale,
    options,
    setDensity,
    setLocale,
    setOptions,
    setTheme,
    text,
  }
}

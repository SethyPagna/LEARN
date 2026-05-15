"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { getVocabulary, isSupportedLocale, loadVocabulary, type SupportedLocale } from "@/lib/i18n/vocabulary"

type Density = "compact" | "comfortable"
export type WorkspaceOptions = {
  dashboardDetail: "focused" | "detailed"
  showWeakTopicBars: boolean
  notesAutosave: boolean
  noteEditorSize: "standard" | "large"
  docsTemplate: "study" | "cornell" | "project"
  sheetRows: number
  slidesAspect: "16:9" | "4:3"
  fileLayout: "list" | "grid"
  filePreview: boolean
  quizMode: "practice" | "exam" | "review"
  revealAnswers: boolean
  gameMode: "sprint" | "matching" | "memory"
  gameQuestionLimit: number
  calendarLeadMinutes: number
  calendarDefaultMinutes: number
  aiMode: "coach" | "route" | "rewrite" | "quiz" | "flashcards" | "translate" | "cleanup" | "mistake"
  aiIncludeNotes: boolean
  aiTemperature: number
  aiMaxTokens: number
  collaborationPresence: boolean
  chatCompact: boolean
  adminVerbose: boolean
  highContrast: boolean
  reducedMotion: boolean
  dyslexiaFriendly: boolean
  privacyDefault: "private" | "connections" | "public"
  dailyReviewCap: number
  restDay: "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"
  feedSerendipity: number
}

const LANGUAGE_KEY = "learn_locale"
const DENSITY_KEY = "learn_density"
const OPTIONS_KEY = "learn_workspace_options"

export const defaultWorkspaceOptions: WorkspaceOptions = {
  dashboardDetail: "detailed",
  showWeakTopicBars: true,
  notesAutosave: false,
  noteEditorSize: "standard",
  docsTemplate: "study",
  sheetRows: 8,
  slidesAspect: "16:9",
  fileLayout: "list",
  filePreview: true,
  quizMode: "practice",
  revealAnswers: true,
  gameMode: "sprint",
  gameQuestionLimit: 12,
  calendarLeadMinutes: 15,
  calendarDefaultMinutes: 45,
  aiMode: "route",
  aiIncludeNotes: true,
  aiTemperature: 0.45,
  aiMaxTokens: 1200,
  collaborationPresence: true,
  chatCompact: false,
  adminVerbose: true,
  highContrast: false,
  reducedMotion: false,
  dyslexiaFriendly: false,
  privacyDefault: "private",
  dailyReviewCap: 30,
  restDay: "sunday",
  feedSerendipity: 15,
}

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

  useEffect(() => {
    setMounted(true)
    const storedLocale = getStoredValue(LANGUAGE_KEY)
    if (isSupportedLocale(storedLocale)) setLocaleState(storedLocale)
    const storedDensity = getStoredValue(DENSITY_KEY)
    if (storedDensity === "comfortable") setDensityState("comfortable")
    const storedOptions = getStoredValue(OPTIONS_KEY)
    if (storedOptions) {
      try {
        setOptionsState({ ...defaultWorkspaceOptions, ...JSON.parse(storedOptions) })
      } catch {
        setOptionsState(defaultWorkspaceOptions)
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
  }, [options.highContrast, options.reducedMotion, options.dyslexiaFriendly])

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
      if (typeof window !== "undefined") window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(merged))
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

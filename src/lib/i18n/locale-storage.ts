import { isSupportedLocale, type SupportedLocale } from "./vocabulary"

export const LANGUAGE_KEY = "learn_locale"
export const LOCALE_CHANGE_EVENT = "learn:locale-change"
export const DEFAULT_LOCALE: SupportedLocale = "en"

export function normalizeStoredLocale(value: unknown): SupportedLocale {
  return typeof value === "string" && isSupportedLocale(value) ? value : DEFAULT_LOCALE
}

export function readStoredLocale(): SupportedLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE
  return normalizeStoredLocale(window.localStorage.getItem(LANGUAGE_KEY))
}

export function writeStoredLocale(locale: SupportedLocale) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(LANGUAGE_KEY, locale)
  window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT))
}

export function applyLocaleToDocument(locale: SupportedLocale) {
  if (typeof document === "undefined") return
  document.documentElement.lang = locale
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr"
}

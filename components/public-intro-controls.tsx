"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { ArrowRight, Check, Languages, Moon, Sun } from "lucide-react"
import { isSupportedLocale, languageNames, supportedLocales, type SupportedLocale } from "@/lib/i18n/vocabulary"

const LANGUAGE_KEY = "learn_locale"

const publicLabels: Partial<Record<SupportedLocale, { open: string; signIn: string; language: string; light: string; dark: string }>> = {
  ar: { open: "فتح مساحة العمل", signIn: "تسجيل الدخول", language: "اللغة", light: "الوضع الفاتح", dark: "الوضع الداكن" },
  de: { open: "Arbeitsbereich öffnen", signIn: "Anmelden", language: "Sprache", light: "Heller Modus", dark: "Dunkler Modus" },
  en: { open: "Open workspace", signIn: "Sign in", language: "Language", light: "Light mode", dark: "Dark mode" },
  es: { open: "Abrir espacio", signIn: "Iniciar sesión", language: "Idioma", light: "Modo claro", dark: "Modo oscuro" },
  fr: { open: "Ouvrir l'espace", signIn: "Se connecter", language: "Langue", light: "Mode clair", dark: "Mode sombre" },
  ja: { open: "ワークスペース", signIn: "ログイン", language: "言語", light: "ライトモード", dark: "ダークモード" },
  km: { open: "បើកកន្លែងធ្វើការ", signIn: "ចូលគណនី", language: "ភាសា", light: "របៀបភ្លឺ", dark: "របៀបងងឹត" },
  ko: { open: "워크스페이스 열기", signIn: "로그인", language: "언어", light: "라이트 모드", dark: "다크 모드" },
  "zh-CN": { open: "打开工作区", signIn: "登录", language: "语言", light: "浅色模式", dark: "深色模式" },
  "zh-TW": { open: "打開工作區", signIn: "登入", language: "語言", light: "淺色模式", dark: "深色模式" },
}

function getStoredLocale(): SupportedLocale {
  if (typeof window === "undefined") return "en"
  const storedLocale = window.localStorage.getItem(LANGUAGE_KEY) || ""
  return isSupportedLocale(storedLocale) ? storedLocale : "en"
}

export function PublicIntroControls({ signedIn }: { signedIn: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [locale, setLocaleState] = useState<SupportedLocale>("en")
  const [mounted, setMounted] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const labels = publicLabels[locale] || publicLabels.en!
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark"
  const ThemeIcon = resolvedTheme === "dark" ? Sun : Moon

  useEffect(() => {
    setMounted(true)
    setLocaleState(getStoredLocale())
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr"
  }, [locale])

  function setLocale(nextLocale: SupportedLocale) {
    setLocaleState(nextLocale)
    window.localStorage.setItem(LANGUAGE_KEY, nextLocale)
    setLanguageOpen(false)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setTheme(nextTheme)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300/70 bg-white/70 text-slate-800 shadow-sm transition hover:border-emerald-500/50 hover:bg-emerald-50 dark:border-white/12 dark:bg-white/8 dark:text-white/82 dark:hover:border-emerald-300/45 dark:hover:bg-white/14"
        aria-label={nextTheme === "light" ? labels.light : labels.dark}
        title={nextTheme === "light" ? labels.light : labels.dark}
      >
        <ThemeIcon className="h-4 w-4" />
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setLanguageOpen((open) => !open)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300/70 bg-white/70 text-slate-800 shadow-sm transition hover:border-emerald-500/50 hover:bg-emerald-50 dark:border-white/12 dark:bg-white/8 dark:text-white/82 dark:hover:border-emerald-300/45 dark:hover:bg-white/14"
          aria-expanded={languageOpen}
          aria-label={labels.language}
          title={mounted ? languageNames[locale] : labels.language}
        >
          <Languages className="h-4 w-4" />
        </button>
        {languageOpen ? (
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 text-slate-950 shadow-2xl dark:border-white/12 dark:bg-[#101722] dark:text-white">
            <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/48">{labels.language}</p>
            <div className="grid max-h-80 gap-1 overflow-auto pr-1">
              {supportedLocales.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setLocale(item)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-emerald-50 hover:text-emerald-900 dark:hover:bg-white/8 dark:hover:text-white ${
                    locale === item ? "bg-emerald-600 text-white dark:bg-emerald-300 dark:text-slate-950" : "text-slate-700 dark:text-white/78"
                  }`}
                >
                  <span>{languageNames[item]}</span>
                  {locale === item ? <Check className="h-4 w-4" /> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <Link href={signedIn ? "/dashboard" : "/login"} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300/70 bg-white/70 px-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-emerald-500/50 hover:bg-emerald-50 dark:border-white/12 dark:bg-white/8 dark:text-white/82 dark:hover:border-emerald-300/45 dark:hover:bg-white/14">
        {signedIn ? labels.open : labels.signIn}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

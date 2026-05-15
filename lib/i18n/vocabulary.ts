export const supportedLocales = [
  "en",
  "km",
  "zh-CN",
  "zh-TW",
  "vi",
  "th",
  "fr",
  "es",
  "de",
  "ja",
  "ko",
  "pt",
  "it",
  "ar",
  "hi",
  "id",
  "ms",
  "tr",
] as const

export type SupportedLocale = (typeof supportedLocales)[number]

export const languageNames: Record<SupportedLocale, string> = {
  en: "English",
  km: "Khmer",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  vi: "Vietnamese",
  th: "Thai",
  fr: "French",
  es: "Spanish",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  pt: "Portuguese",
  it: "Italian",
  ar: "Arabic",
  hi: "Hindi",
  id: "Indonesian",
  ms: "Malay",
  tr: "Turkish",
}

export const baseVocabulary = {
  appName: "LEARN",
  dashboard: "Dashboard",
  learn: "Learn",
  vault: "Vault",
  feed: "Feed",
  graph: "Graph",
  reviews: "Reviews",
  studio: "Studio",
  discover: "Discover",
  spaces: "Spaces",
  rooms: "Rooms",
  battles: "Battles",
  notes: "Notes",
  knowledgeBase: "Knowledge base",
  quizzes: "Quizzes",
  practice: "Practice",
  aiTutor: "AI tutor",
  files: "Files",
  progress: "Progress",
  calendar: "Calendar",
  settings: "Settings",
  admin: "Admin",
  signIn: "Sign in",
  signOut: "Sign out",
  createNote: "New page",
  save: "Save",
  askTutor: "Ask tutor",
  submitAttempt: "Submit attempt",
  weakTopics: "Weak topics",
  studyPlan: "Study plan",
  recentWorkspace: "Recent workspace",
  providerReady: "Provider readiness",
  setupRequired: "Setup required",
  goalCompletion: "Goal completion",
  quizBanks: "Quiz banks",
  focusTopics: "Focus topics",
  searchNotes: "Search notes",
  today: "Today",
  profile: "Profile",
  workspace: "Workspace",
  members: "Members",
  social: "Social",
  groups: "Groups",
  chat: "Chat",
  docs: "Docs",
  sheets: "Sheets",
  slides: "Slides",
  games: "Games",
  audit: "Audit",
  darkMode: "Dark mode",
  lightMode: "Light mode",
  density: "Density",
  language: "Language",
  upload: "Upload",
  download: "Download",
  newItem: "New",
  edit: "Edit",
  delete: "Delete",
  restore: "Restore",
  archive: "Archive",
  undo: "Undo",
  redo: "Redo",
  history: "History",
  favorite: "Favorite",
  tags: "Tags",
  emoji: "Emoji",
  media: "Media",
  import: "Import",
  export: "Export",
  invite: "Invite",
  start: "Start",
  empty: "Nothing here yet",
  loading: "Loading",
  error: "Something went wrong",
}

export type Vocabulary = typeof baseVocabulary
export type VocabularyPatch = Partial<Vocabulary>
export type LanguagePack = Partial<Record<SupportedLocale, VocabularyPatch>>

type LocalePackLoader = () => Promise<{ default: LanguagePack }>

const loadAsianPack: LocalePackLoader = () => import("./packs/asian")
const loadLatinPack: LocalePackLoader = () => import("./packs/latin")
const loadRtlPack: LocalePackLoader = () => import("./packs/rtl")

const localePackLoaders: Partial<Record<SupportedLocale, LocalePackLoader>> = {
  km: loadAsianPack,
  "zh-CN": loadAsianPack,
  "zh-TW": loadAsianPack,
  vi: loadAsianPack,
  th: loadAsianPack,
  ja: loadAsianPack,
  ko: loadAsianPack,
  hi: loadAsianPack,
  id: loadAsianPack,
  ms: loadAsianPack,
  fr: loadLatinPack,
  es: loadLatinPack,
  de: loadLatinPack,
  pt: loadLatinPack,
  it: loadLatinPack,
  tr: loadLatinPack,
  ar: loadRtlPack,
}

const vocabularyCache: Partial<Record<SupportedLocale, Vocabulary>> = {
  en: baseVocabulary,
}
const languagePackPromises = new Map<LocalePackLoader, Promise<LanguagePack>>()

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return supportedLocales.includes(locale as SupportedLocale)
}

function combineVocabulary(patch: VocabularyPatch = {}): Vocabulary {
  return { ...baseVocabulary, ...patch }
}

function cacheLanguagePack(pack: LanguagePack) {
  for (const locale of supportedLocales) {
    if (locale === "en") continue
    const patch = pack[locale]
    if (patch) vocabularyCache[locale] = combineVocabulary(patch)
  }
}

async function getLanguagePack(locale: SupportedLocale) {
  const loader = localePackLoaders[locale]
  if (!loader) return {}

  const existing = languagePackPromises.get(loader)
  if (existing) return existing

  const promise = loader().then((module) => {
    cacheLanguagePack(module.default)
    return module.default
  })
  languagePackPromises.set(loader, promise)
  return promise
}

export function getVocabulary(locale: string): Vocabulary {
  const supportedLocale = isSupportedLocale(locale) ? locale : "en"
  return vocabularyCache[supportedLocale] ?? vocabularyCache.en ?? baseVocabulary
}

export async function loadVocabulary(locale: string): Promise<Vocabulary> {
  const supportedLocale = isSupportedLocale(locale) ? locale : "en"
  const cached = vocabularyCache[supportedLocale]
  if (cached) return cached

  await getLanguagePack(supportedLocale)
  return vocabularyCache[supportedLocale] ?? combineVocabulary()
}

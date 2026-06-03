import type { Vocabulary } from "./i18n/vocabulary"
import type { StudioKind, View } from "@/components/learn/types"

export type NavigationIconKey =
  | "ai"
  | "calendar"
  | "dashboard"
  | "practice"
  | "settings"
  | "social"
  | "studio"
  | "workspaces"

export interface LearnNavigationItem {
  aliases?: readonly View[]
  iconKey: NavigationIconKey
  labelKey: keyof Vocabulary
  view: View
}

export interface LearnNavigationGroup {
  caption: string
  items: readonly LearnNavigationItem[]
  label: string
}

export interface LauncherCommandConfig {
  detail: string
  iconKey: NavigationIconKey
  keywords: readonly string[]
  label: string
  view: View
}

export interface NavigationTarget {
  groupLabel: string
  isAlias: boolean
  primaryView: View
  route: string
  view: View
}

export const studioViews = ["studio", "notes", "docs", "sheets", "slides"] as const satisfies readonly View[]
export const studioAliasViews = ["notes", "docs", "sheets", "slides"] as const satisfies readonly View[]
export const learnAliasViews = ["vault", "feed", "discover", "graph", "progress"] as const satisfies readonly View[]
export const learnWorkspaceViews = [] as const satisfies readonly View[]
export const practiceViews = ["practice", "quizzes", "games", "reviews"] as const satisfies readonly View[]
export const socialViews = ["social", "chat", "spaces", "rooms", "battles"] as const satisfies readonly View[]
export const manageAliasViews = ["profile", "admin"] as const satisfies readonly View[]

export const viewRoutes: Record<View, string> = {
  admin: "/admin",
  ai: "/ai",
  battles: "/battles",
  calendar: "/calendar",
  chat: "/chat",
  dashboard: "/dashboard",
  discover: "/discover",
  docs: "/docs",
  feed: "/feed",
  files: "/files",
  games: "/games",
  graph: "/graph",
  learn: "/learn",
  notes: "/notes",
  practice: "/practice",
  profile: "/profile",
  progress: "/progress",
  quizzes: "/quizzes",
  reviews: "/reviews",
  rooms: "/rooms",
  settings: "/settings",
  sheets: "/sheets",
  slides: "/slides",
  social: "/social",
  spaces: "/groups",
  studio: "/studio",
  vault: "/vault",
}

export const viewLabelKeys: Record<View, keyof Vocabulary> = {
  admin: "admin",
  ai: "aiTutor",
  battles: "battles",
  calendar: "calendar",
  chat: "chat",
  dashboard: "dashboard",
  discover: "discover",
  docs: "docs",
  feed: "feed",
  files: "files",
  games: "games",
  graph: "graph",
  learn: "learn",
  notes: "notes",
  practice: "practice",
  profile: "profile",
  progress: "progress",
  quizzes: "quizzes",
  reviews: "reviews",
  rooms: "rooms",
  settings: "settings",
  sheets: "sheets",
  slides: "slides",
  social: "social",
  spaces: "spaces",
  studio: "studio",
  vault: "vault",
}

const pathViewAliases: Record<string, View> = {
  groups: "spaces",
  learn: "dashboard",
  reviews: "practice",
}

export const navigationGroups: readonly LearnNavigationGroup[] = [
  {
    label: "Home",
    caption: "Dashboard and next steps",
    items: [{ view: "dashboard", labelKey: "dashboard", iconKey: "dashboard" }],
  },
  {
    label: "Learn",
    caption: "Studio, AI tutor, files, calendar, and planned learning blocks",
    items: [
      { view: "studio", labelKey: "studio", iconKey: "studio", aliases: studioAliasViews },
      { view: "ai", labelKey: "aiTutor", iconKey: "ai" },
      { view: "files", labelKey: "files", iconKey: "studio" },
      { view: "calendar", labelKey: "calendar", iconKey: "calendar", aliases: learnAliasViews },
    ],
  },
  {
    label: "Practice",
    caption: "Quizzes, games, retries, and reviews",
    items: [{ view: "practice", labelKey: "practice", iconKey: "practice", aliases: ["quizzes", "games", "reviews"] }],
  },
  {
    label: "Social",
    caption: "Chat, groups, rooms, and battles",
    items: [{ view: "social", labelKey: "social", iconKey: "social", aliases: socialViews.filter((view) => view !== "social") }],
  },
  {
    label: "Manage",
    caption: "Profile, preferences, security, and admin",
    items: [{ view: "settings", labelKey: "settings", iconKey: "settings", aliases: manageAliasViews }],
  },
] as const

export const launcherCommands: readonly LauncherCommandConfig[] = [
  { label: "Create in Studio", detail: "New note, doc, sheet, or slide", view: "studio", iconKey: "studio", keywords: ["new", "create", "note", "doc", "sheet", "slide", "studio"] },
  { label: "Open files", detail: "Uploads, media, and imports", view: "files", iconKey: "studio", keywords: ["file", "upload", "download", "media", "import"] },
  { label: "Start reviews", detail: "Open practice and review loops", view: "practice", iconKey: "practice", keywords: ["review", "recall", "flashcard", "practice"] },
  { label: "Practice now", detail: "Quizzes and games", view: "practice", iconKey: "practice", keywords: ["quiz", "game", "practice", "test"] },
  { label: "Ask AI tutor", detail: "Prompt, rewrite, quiz, plan", view: "ai", iconKey: "ai", keywords: ["ai", "tutor", "prompt", "rewrite", "plan"] },
  { label: "Plan calendar", detail: "Study blocks and due dates", view: "calendar", iconKey: "calendar", keywords: ["calendar", "time", "schedule", "plan"] },
  { label: "Open profile", detail: "Identity, public artifacts, and privacy", view: "profile", iconKey: "settings", keywords: ["profile", "identity", "privacy", "public"] },
  { label: "Admin controls", detail: "Providers, users, audit, and health", view: "admin", iconKey: "settings", keywords: ["admin", "provider", "audit", "health", "secret"] },
  { label: "Tune settings", detail: "Theme, language, density, accessibility", view: "settings", iconKey: "settings", keywords: ["settings", "theme", "language", "accessibility", "density"] },
] as const

export const navigationItems = navigationGroups.flatMap((group) => group.items)

export function getNavigationItemDetail(item: LearnNavigationItem) {
  const group = navigationGroups.find((entry) => entry.items.some((candidate) => candidate.view === item.view))
  return group?.caption ?? "Open section"
}

export function getStudioKind(view: View): StudioKind {
  return view === "docs" || view === "sheets" || view === "slides" ? view : "notes"
}

export function viewFromPath(pathname: string): View | null {
  const segment = pathname.split("/").filter(Boolean)[0] || "dashboard"
  if (segment === "quiz") return "quizzes"
  if (segment in pathViewAliases) return pathViewAliases[segment]
  if (segment in viewRoutes) return segment as View
  return null
}

export function resolveNavigationTarget(view: View): NavigationTarget {
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (item.view === view || item.aliases?.includes(view)) {
        return {
          groupLabel: group.label,
          isAlias: item.view !== view,
          primaryView: item.view,
          route: viewRoutes[view],
          view,
        }
      }
    }
  }

  return {
    groupLabel: "Home",
    isAlias: view !== "dashboard",
    primaryView: "dashboard",
    route: viewRoutes[view],
    view,
  }
}

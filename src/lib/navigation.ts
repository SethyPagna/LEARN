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

/**
 * A launcher entry that opens a surface instead of navigating to a view.
 *
 * The launcher lives in the sidebar and can only reach a `View`, but two
 * entries need to open something that is not a destination: the single Create
 * control and the "What's where" guide. Rather than inventing two views (and two
 * more nouns) for them, an entry may name an action; the launcher dispatches it
 * and `app-nav.tsx` performs it. `view` stays required so every entry still has
 * a sane fallback and keeps the existing search ranking intact.
 */
export type LauncherCommandAction = "create-menu" | "place-guide"

export interface LauncherCommandConfig {
  action?: LauncherCommandAction
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
/**
 * `canvas` is an alias of Studio rather than a ninth sidebar destination: the
 * sidebar is capped at eight primary items (see navigation.test.ts), and the
 * design canvas is reached from Studio's launcher entry and `/canvas`.
 */
export const studioAliasViews = ["notes", "docs", "sheets", "slides", "canvas"] as const satisfies readonly View[]
export const learnAliasViews = ["vault", "feed", "discover", "graph", "progress"] as const satisfies readonly View[]
/**
 * `live` joins `quizzes`/`games`/`reviews` as an alias of Practice for the same
 * reason `canvas` is an alias of Studio: the sidebar is capped at eight primary
 * items (see navigation.test.ts), so a new destination is reached through its
 * group's launcher entry and its own route (`/live`).
 */
export const practiceViews = ["practice", "quizzes", "live", "games", "reviews"] as const satisfies readonly View[]
export const socialViews = ["social", "chat", "spaces", "rooms", "battles"] as const satisfies readonly View[]
export const manageAliasViews = ["profile", "admin"] as const satisfies readonly View[]

export const viewRoutes: Record<View, string> = {
  admin: "/admin",
  ai: "/ai",
  battles: "/battles",
  calendar: "/calendar",
  canvas: "/canvas",
  chat: "/chat",
  dashboard: "/dashboard",
  discover: "/discover",
  docs: "/docs",
  feed: "/feed",
  files: "/files",
  games: "/games",
  graph: "/graph",
  live: "/live",
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
  canvas: "canvas",
  chat: "chat",
  dashboard: "dashboard",
  discover: "discover",
  docs: "docs",
  feed: "feed",
  files: "files",
  games: "games",
  graph: "graph",
  live: "liveQuiz",
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
  // `/learn` was a real route with a `View` member but no view branch ever
  // rendered it, so the member was removed. The path keeps working by
  // resolving to the dashboard, exactly as it did before.
  learn: "dashboard",
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
    items: [{ view: "practice", labelKey: "practice", iconKey: "practice", aliases: ["quizzes", "live", "games", "reviews"] }],
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
  { label: "Create something new", detail: "Pick from every artifact type and see what each one is", view: "studio", iconKey: "studio", action: "create-menu", keywords: ["create", "new", "make", "start", "note", "doc", "sheet", "deck", "slide", "canvas", "quiz", "live", "artifact"] },
  { label: "Create in Studio", detail: "New note, doc, sheet, or slide", view: "studio", iconKey: "studio", keywords: ["new", "create", "note", "doc", "sheet", "slide", "studio"] },
  { label: "Open design canvas", detail: "Free-form layout with snapping, layers, and groups", view: "canvas", iconKey: "studio", keywords: ["canvas", "design", "layout", "drag", "layer", "z-order", "rotate", "snap"] },
  { label: "Open files", detail: "Uploads, media, and imports", view: "files", iconKey: "studio", keywords: ["file", "upload", "download", "media", "import"] },
  { label: "Start reviews", detail: "Reveal and grade due review cards", view: "reviews", iconKey: "practice", keywords: ["review", "recall", "flashcard", "practice"] },
  { label: "Practice now", detail: "Quizzes and games", view: "practice", iconKey: "practice", keywords: ["quiz", "game", "practice", "test"] },
  { label: "Host a live quiz", detail: "Join code, lobby, timer, and live standings", view: "live", iconKey: "practice", keywords: ["live", "quiz", "kahoot", "host", "join", "code", "lobby", "game"] },
  { label: "Ask AI tutor", detail: "Prompt, rewrite, quiz, plan", view: "ai", iconKey: "ai", keywords: ["ai", "tutor", "prompt", "rewrite", "plan"] },
  { label: "Plan calendar", detail: "Study blocks and due dates", view: "calendar", iconKey: "calendar", keywords: ["calendar", "time", "schedule", "plan"] },
  { label: "Open profile", detail: "Identity, public artifacts, and privacy", view: "profile", iconKey: "settings", keywords: ["profile", "identity", "privacy", "public"] },
  { label: "Admin controls", detail: "Providers, users, audit, and health", view: "admin", iconKey: "settings", keywords: ["admin", "provider", "audit", "health", "secret"] },
  { label: "Tune settings", detail: "Theme, language, density, accessibility", view: "settings", iconKey: "settings", keywords: ["settings", "theme", "language", "accessibility", "density"] },
  { label: "What can LEARN do?", detail: "One sentence on every place in the app", view: "dashboard", iconKey: "workspaces", action: "place-guide", keywords: ["guide", "help", "what", "where", "explain", "tour", "learn", "place", "understand", "confused", "start"] },
] as const

export const navigationItems = navigationGroups.flatMap((group) => group.items)

/**
 * The "divider tab" each area of the app owns. Colours live in globals.css as
 * `--tab-<key>`; this map only says which tab a primary destination uses.
 */
export type SectionTab = "home" | "studio" | "ai" | "files" | "calendar" | "practice" | "social" | "settings"

const sectionTabsByPrimaryView: Partial<Record<View, SectionTab>> = {
  dashboard: "home",
  studio: "studio",
  ai: "ai",
  files: "files",
  calendar: "calendar",
  practice: "practice",
  social: "social",
  settings: "settings",
}

export function sectionTabForView(view: View): SectionTab {
  return sectionTabsByPrimaryView[resolveNavigationTarget(view).primaryView] ?? "home"
}

/**
 * Pages inside a primary destination, shown as indented tabs under it in the
 * sidebar and as their own entries in the command palette. They are not
 * primary items: the sidebar stays capped at eight (see navigation.test.ts).
 */
export const navigationSubViews: Partial<Record<View, readonly View[]>> = {
  studio: ["notes", "docs", "sheets", "slides", "canvas"],
  calendar: ["vault", "progress", "graph", "feed"],
  practice: ["quizzes", "live", "games", "reviews"],
  social: ["chat", "spaces", "rooms", "battles"],
  settings: ["profile", "admin"],
}

/** Sub views only an admin may open. */
export const adminOnlyViews: readonly View[] = ["admin"]

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

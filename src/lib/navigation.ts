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
  /** The place's tab row, in order. */
  tabs?: readonly View[]
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

/**
 * Render lists: which workspace draws a view. They are not the places a view
 * belongs to (Reviews is drawn on its own but lives in Today, for example);
 * membership is `navigationGroups` below.
 */
export const studioViews = ["studio", "notes", "docs", "sheets", "slides"] as const satisfies readonly View[]
export const practiceViews = ["practice", "quizzes", "live", "games", "reviews"] as const satisfies readonly View[]
export const socialViews = ["social", "chat", "spaces", "rooms", "battles"] as const satisfies readonly View[]

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
  dashboard: "today",
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
  social: "friends",
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

/**
 * The five places of LEARN, one sidebar item and one phone dock button each.
 *
 * Every view belongs to exactly one place: the place's own view or one of its
 * `aliases`. `tabs` is the place's tab row, in order. The editors (notes, docs,
 * sheets, slides and the design canvas) belong to Create without a tab: an open
 * editor shows no tab row.
 */
export const navigationGroups: readonly LearnNavigationGroup[] = [
  {
    label: "Today",
    caption: "Your buddy, plan, calendar and reviews",
    items: [{ view: "dashboard", labelKey: "today", iconKey: "dashboard", aliases: ["calendar", "progress", "reviews"], tabs: ["dashboard", "calendar", "progress", "reviews"] }],
  },
  {
    label: "Create",
    caption: "Studio, vault and files",
    items: [{ view: "studio", labelKey: "create", iconKey: "studio", aliases: ["notes", "docs", "sheets", "slides", "canvas", "vault", "files"], tabs: ["studio", "vault", "files"] }],
  },
  {
    label: "Practice",
    caption: "Quizzes, live games, games, AI tutor and graph",
    items: [{ view: "practice", labelKey: "practice", iconKey: "practice", aliases: ["quizzes", "live", "games", "ai", "graph"], tabs: ["quizzes", "live", "games", "ai", "graph"] }],
  },
  {
    label: "Friends",
    caption: "Chats, groups, rooms, battles and feed",
    items: [{ view: "social", labelKey: "friends", iconKey: "social", aliases: ["chat", "spaces", "rooms", "battles", "feed", "discover"], tabs: ["chat", "spaces", "rooms", "battles", "feed"] }],
  },
  {
    label: "Me",
    caption: "Your profile and settings",
    items: [{ view: "profile", labelKey: "me", iconKey: "settings", aliases: ["settings", "admin"], tabs: ["profile", "settings", "admin"] }],
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
 * The colour each place wears. Colours live in globals.css as `--tab-<key>`;
 * this map only says which one a place uses.
 */
export type SectionTab = "home" | "studio" | "ai" | "files" | "calendar" | "practice" | "social" | "settings"

const sectionTabsByPrimaryView: Partial<Record<View, SectionTab>> = {
  dashboard: "home",
  studio: "studio",
  practice: "practice",
  social: "social",
  profile: "settings",
}

export function sectionTabForView(view: View): SectionTab {
  return sectionTabsByPrimaryView[resolveNavigationTarget(view).primaryView] ?? "home"
}

/** Views only an admin may open. */
export const adminOnlyViews: readonly View[] = ["admin"]

/** The tab row of the place a view belongs to, without the tabs this person may not open. */
export function placeTabsForView(view: View, isAdmin = false): readonly View[] {
  const primaryView = resolveNavigationTarget(view).primaryView
  const tabs = navigationItems.find((item) => item.view === primaryView)?.tabs ?? []
  return tabs.filter((tab) => isAdmin || !adminOnlyViews.includes(tab))
}

/**
 * Views without a tab of their own that light up a sibling tab: a place's own
 * view shows its first page, `/discover` is the feed, and the canvas list is
 * a Studio filter.
 */
const tabStandIns: Partial<Record<View, View>> = {
  canvas: "studio",
  discover: "feed",
  practice: "quizzes",
  social: "chat",
}

/** The tab a view lights up in its place's tab row, or null for an editor. */
export function placeTabForView(view: View): View | null {
  const tabs = placeTabsForView(view, true)
  if (tabs.includes(view)) return view
  const standIn = tabStandIns[view]
  return standIn && tabs.includes(standIn) ? standIn : null
}

/**
 * What the top bar names, as vocabulary keys. On a page with a tab, the tab row
 * names the page, so the bar names the place. An open editor has no row: the
 * bar names the editor, with its place before it. `editorOpen` covers the
 * design canvas, which is an editor only when a design is open.
 */
export function topbarLabelsForView(view: View, editorOpen = false): { place: keyof Vocabulary | null; title: keyof Vocabulary } {
  const target = resolveNavigationTarget(view)
  const placeLabel = navigationItems.find((item) => item.view === target.primaryView)?.labelKey ?? "today"
  if (!editorOpen && placeTabForView(view)) return { place: null, title: placeLabel }
  return { place: target.isAlias ? placeLabel : null, title: viewLabelKeys[view] }
}

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
    groupLabel: "Today",
    isAlias: view !== "dashboard",
    primaryView: "dashboard",
    route: viewRoutes[view],
    view,
  }
}

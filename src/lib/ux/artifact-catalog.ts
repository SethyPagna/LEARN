import { viewRoutes } from "@/lib/navigation"
import type { View } from "@/components/learn/types"

/**
 * The plain-language catalog behind the Create control and the "What's where"
 * guide.
 *
 * LEARN has many competing nouns — Vault, Studio, Notes, Docs, Sheets, Slides,
 * Canvas, Practice, Live, Social, Chat, Calendar, Files, AI — and until now
 * nothing in the product explained them, and there was no single "make
 * something" action. This module is the one place that answers two questions in
 * plain language:
 *
 * - `ARTIFACT_TYPES` — what can I *make*? (one sentence each, plus when to pick it)
 * - `PLACES` — where can I *be*? (one sentence each)
 *
 * It is deliberately pure: no React, no I/O, no side effects. The components
 * render it, the tests prove it stays exhaustive, and every `route` is read
 * from `viewRoutes` so the catalog cannot drift from real navigation.
 */

/** The navigation group labels a place can belong to. Kept literal so a group
 * that stops being covered is a compile error rather than a silent omission. */
export type NavigationGroupLabel = "Home" | "Learn" | "Practice" | "Social" | "Manage"

/** Group headings used by the Create menu. The order the menu renders them in
 * comes from `ARTIFACT_GROUP_ORDER`, not from this union. */
export type ArtifactGroupLabel = "Writing" | "Numbers & visuals" | "Practice"

/**
 * The artifact ids, in menu order. Declared before the entries so the id type
 * is a plain union rather than one derived from the entries it types; a test
 * pins the entries to this list in both directions.
 */
export const ARTIFACT_TYPE_IDS = ["note", "doc", "sheet", "deck", "canvas", "quiz", "live-game"] as const

export type ArtifactTypeId = (typeof ARTIFACT_TYPE_IDS)[number]

/** The place ids, in guide order (navigation-group order). Same contract as above. */
export const PLACE_IDS = [
  "dashboard",
  "studio",
  "notes",
  "docs",
  "sheets",
  "slides",
  "canvas",
  "vault",
  "files",
  "calendar",
  "ai",
  "feed",
  "graph",
  "progress",
  "practice",
  "quizzes",
  "live",
  "games",
  "reviews",
  "social",
  "chat",
  "spaces",
  "rooms",
  "battles",
  "settings",
  "profile",
  "admin",
] as const

export type PlaceId = (typeof PLACE_IDS)[number]

export interface ArtifactType {
  /** Stable id, also the render key and the tests' count target. */
  id: ArtifactTypeId
  /** Short human name for the thing being made. */
  label: string
  /** One plain-language sentence: what this thing *is*. */
  oneLine: string
  /** One short hint: when to reach for it instead of a sibling. */
  whenToUse: string
  groupLabel: ArtifactGroupLabel
  /** The view that opens this artifact for editing. */
  view: View
  /** Always `viewRoutes[view]` — never a retyped literal. */
  route: string
  keywords: readonly string[]
}

export interface PlaceEntry {
  id: PlaceId
  label: string
  /** One sentence: what this place is for. */
  oneLine: string
  view: View
  /** Always `viewRoutes[view]` — never a retyped literal. */
  route: string
  groupLabel: NavigationGroupLabel
  keywords: readonly string[]
}

/**
 * Ground rules for a new entry: `oneLine` explains the noun to someone who has
 * never seen the app, and `whenToUse` only exists on artifacts because a place
 * is somewhere you go, while an artifact is something you pick.
 */
export const ARTIFACT_TYPES = [
  {
    id: "note",
    label: "Note",
    oneLine: "A note is a quick capture: a title and the thought in your head right now.",
    whenToUse: "Use a note when you want to get something down and organise it later.",
    groupLabel: "Writing",
    view: "notes",
    route: viewRoutes.notes,
    keywords: ["note", "quick", "capture", "idea", "jot", "memo", "reminder"],
  },
  {
    id: "doc",
    label: "Doc",
    oneLine: "A doc is long-form writing with headings and pages.",
    whenToUse: "Use a doc when structure matters more than speed: an essay, a summary, or a study guide.",
    groupLabel: "Writing",
    view: "docs",
    route: viewRoutes.docs,
    keywords: ["doc", "document", "long", "heading", "page", "essay", "report", "guide"],
  },
  {
    id: "sheet",
    label: "Sheet",
    oneLine: "A sheet is a grid of rows and columns you can total, sort, and filter.",
    whenToUse: "Use a sheet when the content is rows and numbers.",
    groupLabel: "Numbers & visuals",
    view: "sheets",
    route: viewRoutes.sheets,
    keywords: ["sheet", "spreadsheet", "table", "grid", "rows", "columns", "numbers", "total"],
  },
  {
    id: "deck",
    label: "Deck",
    oneLine: "A deck is a set of slides you show one screen at a time.",
    whenToUse: "Use a deck when you want to walk someone through an idea out loud, one slide at a time.",
    groupLabel: "Numbers & visuals",
    view: "slides",
    route: viewRoutes.slides,
    keywords: ["deck", "slide", "slides", "presentation", "present", "pitch", "talk"],
  },
  {
    id: "canvas",
    label: "Canvas",
    oneLine: "A canvas is a free-form board where you place shapes, text, and images anywhere.",
    whenToUse: "Use a canvas when the layout itself carries the meaning: a diagram, a mind map, or a poster.",
    groupLabel: "Numbers & visuals",
    view: "canvas",
    route: viewRoutes.canvas,
    keywords: ["canvas", "board", "design", "diagram", "layout", "mind map", "drag", "free-form"],
  },
  {
    id: "quiz",
    label: "Quiz",
    oneLine: "A quiz is a set of questions you answer and get graded on.",
    whenToUse: "Use a quiz when you want to check what you actually remember.",
    groupLabel: "Practice",
    view: "quizzes",
    route: viewRoutes.quizzes,
    keywords: ["quiz", "question", "test", "check", "grade", "score", "exam"],
  },
  {
    id: "live-game",
    label: "Live game",
    oneLine: "A live game is a quiz other people join with a code while you run it.",
    whenToUse: "Use a live game when a group should answer at the same time and watch the standings.",
    groupLabel: "Practice",
    view: "live",
    route: viewRoutes.live,
    keywords: ["live", "game", "host", "join", "code", "lobby", "standings", "class", "together"],
  },
] as const satisfies readonly ArtifactType[]

/** Fixed so the menu cannot reorder itself between renders or environments. */
export const ARTIFACT_GROUP_ORDER: readonly ArtifactGroupLabel[] = ["Writing", "Numbers & visuals", "Practice"]

export interface ArtifactGroup {
  groupLabel: ArtifactGroupLabel
  items: ArtifactType[]
}

/** Every artifact, grouped in `ARTIFACT_GROUP_ORDER`; no entry is ever dropped. */
export function groupArtifactTypes(): ArtifactGroup[] {
  return ARTIFACT_GROUP_ORDER.map((groupLabel) => ({
    groupLabel,
    items: ARTIFACT_TYPES.filter((artifact) => artifact.groupLabel === groupLabel),
  }))
}

/** Artifacts in one group, in declaration order. */
export function catalogForGroup(groupLabel: ArtifactGroupLabel): ArtifactType[] {
  return ARTIFACT_TYPES.filter((artifact) => artifact.groupLabel === groupLabel)
}

export function findArtifact(id: string): ArtifactType | null {
  return ARTIFACT_TYPES.find((artifact) => artifact.id === id) ?? null
}

/**
 * Every place a user can be, in navigation-group order so the guide reads like
 * the sidebar: Home, Learn, Practice, Social, Manage.
 *
 * `discover` is deliberately absent: `/discover` resolves to the `discover`
 * view, which renders the same `FeedView` as `/feed`, so it is not a distinct
 * destination to explain. (`learn` was a second gap until its dead `View` member
 * was removed; `/learn` still resolves to the dashboard.) See
 * `src/tests/ux/artifact-catalog.test.ts`, which pins that gap rather than
 * filling it with a duplicate sentence.
 */
export const PLACES = [
  {
    id: "dashboard",
    label: "Dashboard",
    oneLine: "Your starting view: today's route, recent work, and the gaps still to close.",
    view: "dashboard",
    route: viewRoutes.dashboard,
    groupLabel: "Home",
    keywords: ["home", "dashboard", "start", "today", "route", "overview"],
  },
  {
    id: "studio",
    label: "Studio",
    oneLine: "The writers' room where every note, doc, sheet, and deck is edited.",
    view: "studio",
    route: viewRoutes.studio,
    groupLabel: "Learn",
    keywords: ["studio", "editor", "workspace", "write", "edit", "pane"],
  },
  {
    id: "notes",
    label: "Notes",
    oneLine: "Quick captures, opened straight into Studio.",
    view: "notes",
    route: viewRoutes.notes,
    groupLabel: "Learn",
    keywords: ["note", "notes", "capture", "quick"],
  },
  {
    id: "docs",
    label: "Docs",
    oneLine: "Long-form writing with headings and pages, opened in Studio.",
    view: "docs",
    route: viewRoutes.docs,
    groupLabel: "Learn",
    keywords: ["doc", "docs", "document", "writing", "page"],
  },
  {
    id: "sheets",
    label: "Sheets",
    oneLine: "Grids of rows and numbers, opened in Studio.",
    view: "sheets",
    route: viewRoutes.sheets,
    groupLabel: "Learn",
    keywords: ["sheet", "sheets", "table", "grid", "numbers"],
  },
  {
    id: "slides",
    label: "Slides",
    oneLine: "Slide sets for presenting, opened in Studio.",
    view: "slides",
    route: viewRoutes.slides,
    groupLabel: "Learn",
    keywords: ["slide", "slides", "deck", "presentation"],
  },
  {
    id: "canvas",
    label: "Canvas",
    oneLine: "A free-form board for diagrams, layouts, and posters.",
    view: "canvas",
    route: viewRoutes.canvas,
    groupLabel: "Learn",
    keywords: ["canvas", "board", "design", "diagram", "layout"],
  },
  {
    id: "vault",
    label: "Vault",
    oneLine: "The material you have saved, ready to reopen and reuse.",
    view: "vault",
    route: viewRoutes.vault,
    groupLabel: "Learn",
    keywords: ["vault", "saved", "library", "archive", "reuse"],
  },
  {
    id: "files",
    label: "Files",
    oneLine: "Uploads, media, and imports that feed the rest of your work.",
    view: "files",
    route: viewRoutes.files,
    groupLabel: "Learn",
    keywords: ["file", "files", "upload", "media", "import", "download"],
  },
  {
    id: "calendar",
    label: "Calendar",
    oneLine: "Study blocks, due dates, and the plan for the days ahead.",
    view: "calendar",
    route: viewRoutes.calendar,
    groupLabel: "Learn",
    keywords: ["calendar", "schedule", "plan", "due", "block", "time"],
  },
  {
    id: "ai",
    label: "AI tutor",
    oneLine: "Ask, rewrite, quiz, or plan against your own material.",
    view: "ai",
    route: viewRoutes.ai,
    groupLabel: "Learn",
    keywords: ["ai", "tutor", "prompt", "rewrite", "explain", "plan"],
  },
  {
    id: "feed",
    label: "Feed",
    oneLine: "Short lessons and prompts chosen for what you are studying.",
    view: "feed",
    route: viewRoutes.feed,
    groupLabel: "Learn",
    keywords: ["feed", "discover", "lessons", "prompts", "browse"],
  },
  {
    id: "graph",
    label: "Graph",
    oneLine: "Your notes and reviews drawn as connected nodes.",
    view: "graph",
    route: viewRoutes.graph,
    groupLabel: "Learn",
    keywords: ["graph", "nodes", "connections", "map", "links", "knowledge"],
  },
  {
    id: "progress",
    label: "Progress",
    oneLine: "Scores, streaks, and the topics still giving you trouble.",
    view: "progress",
    route: viewRoutes.progress,
    groupLabel: "Learn",
    keywords: ["progress", "scores", "streak", "stats", "accuracy"],
  },
  {
    id: "practice",
    label: "Practice",
    oneLine: "Where quizzes, games, retries, and reviews are actually run.",
    view: "practice",
    route: viewRoutes.practice,
    groupLabel: "Practice",
    keywords: ["practice", "run", "drill", "retry"],
  },
  {
    id: "quizzes",
    label: "Quizzes",
    oneLine: "Question sets you take, get scored on, and can retry.",
    view: "quizzes",
    route: viewRoutes.quizzes,
    groupLabel: "Practice",
    keywords: ["quiz", "quizzes", "questions", "score", "exam"],
  },
  {
    id: "live",
    label: "Live quiz",
    oneLine: "Host a quiz others join with a code, or join one yourself.",
    view: "live",
    route: viewRoutes.live,
    groupLabel: "Practice",
    keywords: ["live", "host", "join", "code", "lobby", "standings"],
  },
  {
    id: "games",
    label: "Games",
    oneLine: "Timed and streak formats that make drilling feel like play.",
    view: "games",
    route: viewRoutes.games,
    groupLabel: "Practice",
    keywords: ["game", "games", "timed", "sprint", "streak"],
  },
  {
    id: "reviews",
    label: "Reviews",
    oneLine: "Spaced repetition on the cards you have collected.",
    view: "reviews",
    route: viewRoutes.reviews,
    groupLabel: "Practice",
    keywords: ["review", "reviews", "cards", "spaced", "recall", "memory"],
  },
  {
    id: "social",
    label: "Social",
    oneLine: "People, groups, and the study activity happening around you.",
    view: "social",
    route: viewRoutes.social,
    groupLabel: "Social",
    keywords: ["social", "people", "network", "activity"],
  },
  {
    id: "chat",
    label: "Chat",
    oneLine: "Messages with study partners and groups.",
    view: "chat",
    route: viewRoutes.chat,
    groupLabel: "Social",
    keywords: ["chat", "message", "dm", "talk", "conversation"],
  },
  {
    id: "spaces",
    label: "Groups",
    oneLine: "Study groups you belong to, and the people in them.",
    view: "spaces",
    route: viewRoutes.spaces,
    groupLabel: "Social",
    keywords: ["group", "groups", "spaces", "members", "community"],
  },
  {
    id: "rooms",
    label: "Rooms",
    oneLine: "Focus or discussion rooms you sit in together.",
    view: "rooms",
    route: viewRoutes.rooms,
    groupLabel: "Social",
    keywords: ["room", "rooms", "focus", "discussion", "together", "presence"],
  },
  {
    id: "battles",
    label: "Battles",
    oneLine: "Head-to-head quiz matches on a single topic.",
    view: "battles",
    route: viewRoutes.battles,
    groupLabel: "Social",
    keywords: ["battle", "battles", "versus", "match", "compete"],
  },
  {
    id: "settings",
    label: "Settings",
    oneLine: "Theme, language, density, and accessibility for your account.",
    view: "settings",
    route: viewRoutes.settings,
    groupLabel: "Manage",
    keywords: ["settings", "preferences", "theme", "language", "density", "accessibility"],
  },
  {
    id: "profile",
    label: "Profile",
    oneLine: "Your public identity and the work you have chosen to share.",
    view: "profile",
    route: viewRoutes.profile,
    groupLabel: "Manage",
    keywords: ["profile", "identity", "public", "share", "bio"],
  },
  {
    id: "admin",
    label: "Admin",
    oneLine: "Providers, users, audit, and health for whoever operates the workspace.",
    view: "admin",
    route: viewRoutes.admin,
    groupLabel: "Manage",
    keywords: ["admin", "providers", "users", "audit", "health", "operator"],
  },
] as const satisfies readonly PlaceEntry[]

export const PLACE_GROUP_ORDER: readonly NavigationGroupLabel[] = ["Home", "Learn", "Practice", "Social", "Manage"]

export interface PlaceGroup {
  groupLabel: NavigationGroupLabel
  items: PlaceEntry[]
}

/** Every place, grouped in `PLACE_GROUP_ORDER`; no entry is ever dropped. */
export function groupPlaces(): PlaceGroup[] {
  return PLACE_GROUP_ORDER.map((groupLabel) => ({
    groupLabel,
    items: PLACES.filter((place) => place.groupLabel === groupLabel),
  }))
}

export function findPlace(id: string): PlaceEntry | null {
  return PLACES.find((place) => place.id === id) ?? null
}

/**
 * The place entry for a view, or `null` when that view is not a distinct
 * destination (see the `discover` note on `PLACES`).
 */
export function describePlace(view: View): PlaceEntry | null {
  return PLACES.find((place) => place.view === view) ?? null
}

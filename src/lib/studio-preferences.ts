import type { StudioKind, StudioLayoutState, StudioPane, StudioPaneGroup, StudioTab } from "@/components/learn/types"
import { createDefaultStudioLayout, normalizeStudioLayout } from "./studio-features"

export const STUDIO_LAYOUT_KEY = "learn_studio_layout_v2"
export const HEADING_STYLE_KEY = "learn_heading_styles_v1"

export type HeadingStyleLevel = 1 | 2 | 3
export type HeadingStylePreset = {
  color?: string
  fontFamily?: string
  fontSize?: string
}

export const DEFAULT_HEADING_STYLES: Record<HeadingStyleLevel, HeadingStylePreset> = {
  1: { color: "inherit", fontFamily: "Aptos, Inter, sans-serif", fontSize: "32px" },
  2: { color: "inherit", fontFamily: "Aptos, Inter, sans-serif", fontSize: "24px" },
  3: { color: "inherit", fontFamily: "Aptos, Inter, sans-serif", fontSize: "20px" },
}

const STUDIO_KINDS: StudioKind[] = ["notes", "docs", "sheets", "slides"]
const LAYOUT_DIRECTIONS: StudioPaneGroup["direction"][] = ["horizontal", "vertical"]
const DENSITIES: StudioLayoutState["density"][] = ["compact", "comfortable"]
const MAX_STYLE_LENGTH = 120

export function parseStoredStudioLayout(raw: string | null, fallback: StudioLayoutState = createDefaultStudioLayout()): StudioLayoutState {
  const parsed = parseJson(raw)
  return normalizeStoredStudioLayout(parsed, fallback)
}

export function normalizeStoredStudioLayout(value: unknown, fallback: StudioLayoutState = createDefaultStudioLayout()): StudioLayoutState {
  if (!isRecord(value)) return fallback
  const fallbackGroup = fallback.groups[0] ?? createDefaultStudioLayout().groups[0]
  const rawGroups = Array.isArray(value.groups) ? value.groups : []
  const firstGroup = isRecord(rawGroups[0]) ? rawGroups[0] : null
  const panes = normalizeStoredPanes(firstGroup?.panes, fallbackGroup.panes)
  const activePaneId = readString(value.activePaneId, panes[0]?.id ?? fallback.activePaneId)
  const layout: StudioLayoutState = {
    version: 1,
    activePaneId,
    groups: [{
      id: readString(firstGroup?.id, fallbackGroup.id),
      direction: normalizeChoice(firstGroup?.direction, LAYOUT_DIRECTIONS, fallbackGroup.direction),
      panes,
    }],
    inspectorOpen: typeof value.inspectorOpen === "boolean" ? value.inspectorOpen : fallback.inspectorOpen,
    density: normalizeChoice(value.density, DENSITIES, fallback.density),
  }
  return normalizeStudioLayout(layout)
}

export function parseStoredHeadingStyles(raw: string | null): Record<HeadingStyleLevel, HeadingStylePreset> {
  return normalizeHeadingStyles(parseJson(raw))
}

export function normalizeHeadingStyles(value: unknown): Record<HeadingStyleLevel, HeadingStylePreset> {
  if (!isRecord(value)) return DEFAULT_HEADING_STYLES
  return {
    1: normalizeHeadingStyle(value[1], DEFAULT_HEADING_STYLES[1]),
    2: normalizeHeadingStyle(value[2], DEFAULT_HEADING_STYLES[2]),
    3: normalizeHeadingStyle(value[3], DEFAULT_HEADING_STYLES[3]),
  }
}

function normalizeStoredPanes(value: unknown, fallbackPanes: StudioPane[]): StudioPane[] {
  const fallback = fallbackPanes.length ? fallbackPanes : createDefaultStudioLayout().groups[0].panes
  if (!Array.isArray(value)) return fallback
  const panes = value
    .map((item, index) => normalizeStoredPane(item, fallback[index] ?? fallback[0], index))
    .filter((pane): pane is StudioPane => Boolean(pane))
  return panes.length ? panes : fallback
}

function normalizeStoredPane(value: unknown, fallback: StudioPane, index: number): StudioPane | null {
  if (!isRecord(value)) return null
  const tabs = normalizeStoredTabs(value.tabs, fallback.tabs)
  const activeTabId = readString(value.activeTabId, tabs[0]?.id ?? "")
  return {
    id: readString(value.id, `pane_${index + 1}`),
    order: index + 1,
    label: readString(value.label, `Order ${index + 1}`),
    activeTabId: tabs.some((tab) => tab.id === activeTabId) ? activeTabId : tabs[0]?.id ?? "",
    tabs,
    pinned: typeof value.pinned === "boolean" ? value.pinned : fallback.pinned,
  }
}

function normalizeStoredTabs(value: unknown, fallbackTabs: StudioTab[]): StudioTab[] {
  const fallback = fallbackTabs.length ? fallbackTabs : createDefaultStudioLayout().groups[0].panes[0].tabs
  if (!Array.isArray(value)) return fallback
  const tabs = value.map(normalizeStoredTab).filter((tab): tab is StudioTab => Boolean(tab))
  return tabs.length ? tabs : fallback
}

function normalizeStoredTab(value: unknown): StudioTab | null {
  if (!isRecord(value)) return null
  const id = readString(value.id, "")
  const kind = normalizeChoice(value.kind, STUDIO_KINDS, "notes")
  if (!id) return null
  return {
    id,
    kind,
    itemId: typeof value.itemId === "string" ? value.itemId : undefined,
    title: readString(value.title, kind),
    pinned: typeof value.pinned === "boolean" ? value.pinned : undefined,
  }
}

function normalizeHeadingStyle(value: unknown, fallback: HeadingStylePreset): HeadingStylePreset {
  if (!isRecord(value)) return fallback
  return {
    color: readShortString(value.color, fallback.color),
    fontFamily: readShortString(value.fontFamily, fallback.fontFamily),
    fontSize: readShortString(value.fontSize, fallback.fontSize),
  }
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function normalizeChoice<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && options.includes(value as T) ? value as T : fallback
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback
}

function readShortString(value: unknown, fallback: string | undefined): string | undefined {
  if (typeof value !== "string") return fallback
  const trimmed = value.trim()
  return trimmed && trimmed.length <= MAX_STYLE_LENGTH ? trimmed : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

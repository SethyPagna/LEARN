import type { SheetMetadata, SlideObject, StudioDirtyBadge, StudioKind, StudioLayoutState, StudioPane, StudioTab, WorkspaceDeck } from "@/components/learn/types"

export type StudioRecordActionId =
  | "open"
  | "split"
  | "copy"
  | "duplicate"
  | "download"
  | "export"
  | "ai"
  | "archive"
  | "restore"

export type StudioRecordActionGroupId = "open" | "edit" | "share" | "manage"

export type StudioRecordActionGroup = {
  id: StudioRecordActionGroupId
  label: string
  summary: string
  priority: "primary" | "secondary"
  actions: StudioRecordActionId[]
}

export function createStudioTab(kind: StudioKind, title: string, itemId?: string): StudioTab {
  return {
    id: `${kind}_${itemId || "draft"}_${Date.now().toString(36)}`,
    itemId,
    kind,
    title,
  }
}

export function createDefaultStudioLayout(kind: StudioKind = "notes", title = "Studio item", itemId?: string): StudioLayoutState {
  const tab = createStudioTab(kind, title, itemId)
  const pane: StudioPane = {
    id: "pane_1",
    order: 1,
    label: "Order 1",
    activeTabId: tab.id,
    tabs: [tab],
  }
  return {
    version: 1,
    activePaneId: pane.id,
    groups: [{ id: "group_root", direction: "horizontal", panes: [pane] }],
    inspectorOpen: true,
    density: "comfortable",
  }
}

export function normalizeStudioLayout(layout: StudioLayoutState): StudioLayoutState {
  const panes = layout.groups[0]?.panes?.length ? layout.groups[0].panes : createDefaultStudioLayout().groups[0].panes
  const orderedPanes = panes.map((pane, index) => ({
    ...pane,
    order: index + 1,
    label: pane.label?.trim() || `Order ${index + 1}`,
    activeTabId: pane.tabs.some((tab) => tab.id === pane.activeTabId) ? pane.activeTabId : pane.tabs[0]?.id || "",
  }))
  return {
    ...layout,
    version: 1,
    activePaneId: orderedPanes.some((pane) => pane.id === layout.activePaneId) ? layout.activePaneId : orderedPanes[0]?.id || "pane_1",
    groups: [{ id: layout.groups[0]?.id || "group_root", direction: layout.groups[0]?.direction || "horizontal", panes: orderedPanes }],
  }
}

export function splitStudioPane(layout: StudioLayoutState, paneId: string, direction: "horizontal" | "vertical" = "horizontal"): StudioLayoutState {
  const group = layout.groups[0] || createDefaultStudioLayout().groups[0]
  const source = group.panes.find((pane) => pane.id === paneId) || group.panes[0]
  const sourceTab = source.tabs.find((tab) => tab.id === source.activeTabId) || source.tabs[0]
  const newTab = { ...sourceTab, id: `${sourceTab.id}_split_${Date.now().toString(36)}` }
  const newPane: StudioPane = {
    id: `pane_${Date.now().toString(36)}`,
    order: group.panes.length + 1,
    label: `Order ${group.panes.length + 1}`,
    activeTabId: newTab.id,
    tabs: [newTab],
  }
  return normalizeStudioLayout({
    ...layout,
    activePaneId: newPane.id,
    groups: [{ ...group, direction, panes: [...group.panes, newPane] }],
  })
}

export function closeStudioPane(layout: StudioLayoutState, paneId: string): StudioLayoutState {
  const group = layout.groups[0] || createDefaultStudioLayout().groups[0]
  if (group.panes.length <= 1) return layout
  return normalizeStudioLayout({
    ...layout,
    groups: [{ ...group, panes: group.panes.filter((pane) => pane.id !== paneId) }],
  })
}

export function closeOtherStudioPanes(layout: StudioLayoutState, paneId: string): StudioLayoutState {
  const group = layout.groups[0] || createDefaultStudioLayout().groups[0]
  const pane = group.panes.find((item) => item.id === paneId) || group.panes[0]
  return normalizeStudioLayout({
    ...layout,
    activePaneId: pane.id,
    groups: [{ ...group, panes: [pane] }],
  })
}

export function renameStudioPane(layout: StudioLayoutState, paneId: string, label: string): StudioLayoutState {
  const group = layout.groups[0] || createDefaultStudioLayout().groups[0]
  return normalizeStudioLayout({
    ...layout,
    groups: [{ ...group, panes: group.panes.map((pane) => pane.id === paneId ? { ...pane, label } : pane) }],
  })
}

export function pinStudioPane(layout: StudioLayoutState, paneId: string): StudioLayoutState {
  const group = layout.groups[0] || createDefaultStudioLayout().groups[0]
  return normalizeStudioLayout({
    ...layout,
    groups: [{ ...group, panes: group.panes.map((pane) => pane.id === paneId ? { ...pane, pinned: !pane.pinned } : pane) }],
  })
}

export function computeStudioDirtyBadges(input: Partial<Record<StudioKind, { updatedAt?: string } | null>>): StudioDirtyBadge[] {
  return (["notes", "docs", "sheets", "slides"] as StudioKind[]).flatMap((kind) => {
    const draft = input[kind]
    return draft ? [{ kind, count: 1, latestAt: draft.updatedAt }] : []
  })
}

export function buildStudioRecordActionGroups({ archived = false }: { archived?: boolean } = {}): StudioRecordActionGroup[] {
  return [
    {
      id: "open",
      label: "Open",
      summary: archived ? "View or restore before editing" : "Start editing or split the workspace",
      priority: "primary",
      actions: archived ? ["open"] : ["open", "split"],
    },
    {
      id: "edit",
      label: "Edit",
      summary: "Copy, duplicate, or ask AI",
      priority: "primary",
      actions: ["copy", "duplicate", "ai"],
    },
    {
      id: "share",
      label: "Share",
      summary: "Download or export",
      priority: "secondary",
      actions: ["download", "export"],
    },
    {
      id: "manage",
      label: "Manage",
      summary: archived ? "Return this item to Studio" : "Move this item out of the main list",
      priority: archived ? "primary" : "secondary",
      actions: archived ? ["restore"] : ["archive"],
    },
  ]
}

export function addRow(cells: string[][], afterIndex = cells.length - 1) {
  const width = Math.max(1, cells[0]?.length || 1)
  const next = cells.map((row) => [...row])
  next.splice(Math.max(0, afterIndex + 1), 0, Array.from({ length: width }, () => ""))
  return next
}

export function deleteRow(cells: string[][], rowIndex: number) {
  if (cells.length <= 1) return cells
  return cells.filter((_, index) => index !== rowIndex)
}

export function addColumn(cells: string[][], afterIndex = (cells[0]?.length || 1) - 1) {
  return cells.map((row) => {
    const next = [...row]
    next.splice(Math.max(0, afterIndex + 1), 0, "")
    return next
  })
}

export function deleteColumn(cells: string[][], columnIndex: number) {
  if ((cells[0]?.length || 0) <= 1) return cells
  return cells.map((row) => row.filter((_, index) => index !== columnIndex))
}

export function moveRow(cells: string[][], rowIndex: number, direction: -1 | 1) {
  const target = rowIndex + direction
  if (target < 0 || target >= cells.length) return cells
  const next = cells.map((row) => [...row])
  const [row] = next.splice(rowIndex, 1)
  next.splice(target, 0, row)
  return next
}

export function moveColumn(cells: string[][], columnIndex: number, direction: -1 | 1) {
  const width = cells[0]?.length || 0
  const target = columnIndex + direction
  if (target < 0 || target >= width) return cells
  return cells.map((row) => {
    const next = [...row]
    const [cell] = next.splice(columnIndex, 1)
    next.splice(target, 0, cell)
    return next
  })
}

export function fillSheetRange(cells: string[][], metadata: SheetMetadata, direction: "down" | "right") {
  const range = metadata.selectedRange
  if (!range) return cells
  const next = cells.map((row) => [...row])
  const source = next[range.startRow]?.[range.startColumn] ?? ""
  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    for (let columnIndex = range.startColumn; columnIndex <= range.endColumn; columnIndex += 1) {
      const shouldFill = direction === "down" ? rowIndex > range.startRow : columnIndex > range.startColumn
      if (shouldFill && next[rowIndex]) next[rowIndex][columnIndex] = source
    }
  }
  return next
}

export function sortSheetByColumn(cells: string[][], columnIndex: number, direction: "asc" | "desc" = "asc") {
  if (cells.length <= 2) return cells
  const [header, ...rows] = cells
  const factor = direction === "asc" ? 1 : -1
  const sortedRows = [...rows].sort((left, right) => String(left[columnIndex] ?? "").localeCompare(String(right[columnIndex] ?? "")) * factor)
  return [header, ...sortedRows]
}

export function buildSheetFormula(functionName: "SUM" | "AVERAGE" | "MIN" | "MAX" | "COUNT", columnIndex: number, rowCount: number) {
  const column = columnIndexToName(columnIndex)
  const endRow = Math.max(2, rowCount)
  return `=${functionName}(${column}2:${column}${endRow})`
}

export function evaluateSheetFormula(cells: string[][], formula: string) {
  const normalized = formula.trim().toUpperCase()
  const match = normalized.match(/^=(SUM|AVERAGE|MIN|MAX|COUNT)\(([A-Z]+\d+)(?::([A-Z]+\d+))?\)$/)
  if (!match) return { ok: false, value: "", reason: "Unsupported formula" }
  const [, functionName, startRef, endRef = startRef] = match
  const values = readSheetRange(cells, startRef, endRef).map(toNumber).filter((value) => Number.isFinite(value))
  if (!values.length) return { ok: true, value: "0", reason: "No numeric cells" }
  const result = calculateFormula(functionName, values)
  return { ok: true, value: formatFormulaResult(result), reason: `${functionName} across ${values.length} cells` }
}

function calculateFormula(functionName: string, values: number[]) {
  if (functionName === "COUNT") return values.length
  if (functionName === "MIN") return Math.min(...values)
  if (functionName === "MAX") return Math.max(...values)
  const total = values.reduce((sum, value) => sum + value, 0)
  return functionName === "AVERAGE" ? total / values.length : total
}

function readSheetRange(cells: string[][], startRef: string, endRef: string) {
  const start = parseCellRef(startRef)
  const end = parseCellRef(endRef)
  if (!start || !end) return []
  const minRow = Math.min(start.row, end.row)
  const maxRow = Math.max(start.row, end.row)
  const minColumn = Math.min(start.column, end.column)
  const maxColumn = Math.max(start.column, end.column)
  const values: string[] = []
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      values.push(cells[row]?.[column] ?? "")
    }
  }
  return values
}

function parseCellRef(ref: string) {
  const match = ref.match(/^([A-Z]+)(\d+)$/)
  if (!match) return null
  return {
    column: columnNameToIndex(match[1]),
    row: Number(match[2]) - 1,
  }
}

function columnIndexToName(index: number) {
  let next = Math.max(0, index) + 1
  let name = ""
  while (next > 0) {
    const remainder = (next - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    next = Math.floor((next - 1) / 26)
  }
  return name
}

function columnNameToIndex(name: string) {
  return name.split("").reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1
}

function toNumber(value: string) {
  return Number(String(value).replace(/,/g, "").trim())
}

function formatFormulaResult(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "")
}

export function duplicateSlide(slides: WorkspaceDeck["slides"], index: number) {
  const next = [...slides]
  const slide = slides[index]
  if (!slide) return next
  next.splice(index + 1, 0, { ...slide, title: `${slide.title} copy` })
  return next
}

export function moveSlide(slides: WorkspaceDeck["slides"], index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= slides.length) return slides
  const next = [...slides]
  const [slide] = next.splice(index, 1)
  next.splice(target, 0, slide)
  return next
}

export function createSlideObject(type: SlideObject["type"], partial: Partial<SlideObject> = {}): SlideObject {
  return {
    id: partial.id || `slide_object_${Date.now().toString(36)}`,
    type,
    x: partial.x ?? 12,
    y: partial.y ?? 12,
    w: partial.w ?? 48,
    h: partial.h ?? 18,
    text: partial.text,
    src: partial.src,
    style: partial.style,
  }
}

export function slideToObjects(slide: WorkspaceDeck["slides"][number]): SlideObject[] {
  if (slide.objects?.length) return slide.objects as SlideObject[]
  return [
    createSlideObject("text", { id: "title", x: 10, y: 12, w: 80, h: 16, text: slide.title }),
    createSlideObject("text", { id: "body", x: 10, y: 34, w: 80, h: 42, text: slide.body }),
  ]
}

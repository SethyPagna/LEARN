import type { StudioKind, StudioLayoutState, StudioPane, StudioTab, WorkspaceDeck } from "@/components/learn/types"

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

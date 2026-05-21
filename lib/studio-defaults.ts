import type { WorkspaceDeck, WorkspaceSheet } from "@/components/learn/types"

export const blankNoteTitle = "Untitled note"
export const blankDocTitle = "Untitled document"
export const blankSheetTitle = "Untitled sheet"
export const blankDeckTitle = "Untitled deck"
export const blankRichText = "<p></p>"

export const blankSheetCells: string[][] = Array.from({ length: 12 }, () => Array.from({ length: 6 }, () => ""))

export const blankDeckSlides: WorkspaceDeck["slides"] = [
  {
    title: "",
    body: "",
    accent: "Slide 1",
    layout: "title",
    theme: "midnight",
    background: "#111827",
    transition: "none",
    animation: "none",
    speakerNotes: "",
  },
]

export const blankSheetFingerprint = JSON.stringify(blankSheetCells)
export const blankDeckFingerprint = JSON.stringify(blankDeckSlides)

export function getBlankStudioTitle(kind: "notes" | "docs" | "sheets" | "slides") {
  if (kind === "notes") return blankNoteTitle
  if (kind === "docs") return blankDocTitle
  if (kind === "sheets") return blankSheetTitle
  return blankDeckTitle
}

export function ensureSheetCells(value: unknown): string[][] {
  if (!Array.isArray(value)) return blankSheetCells
  if (!value.every((row) => Array.isArray(row))) return blankSheetCells
  return value as string[][]
}

export function parseSheetCells(sheet?: Pick<WorkspaceSheet, "cells">): string[][] {
  return ensureSheetCells(parseJsonArray<unknown>(sheet?.cells, blankSheetCells))
}

export function parseDeckSlides(deck?: Pick<WorkspaceDeck, "slides">): WorkspaceDeck["slides"] {
  return parseJsonArray<WorkspaceDeck["slides"]>(deck?.slides, blankDeckSlides)
}

function parseJsonArray<T>(value: unknown, fallback: T): T {
  if (Array.isArray(value)) return value as T
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed as T : fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

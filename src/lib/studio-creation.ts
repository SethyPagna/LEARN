import type { ProjectKind } from "../components/learn/studio-projects"
import { viewRoutes } from "./navigation"
import type { ArtifactTypeId } from "./ux/artifact-catalog"

export type StudioCreationKind = Exclude<ProjectKind, "canvas">
export interface StudioCreationIntent { id: number; kind: StudioCreationKind }
export type ArtifactCreationPlan =
  | { type: "project"; href: string; kind: StudioCreationKind }
  | { type: "canvas" | "quiz" | "live"; href: string }

export function parseStudioCreationKind(value: unknown): StudioCreationKind | null {
  return value === "notes" || value === "docs" || value === "sheets" || value === "slides" ? value : null
}

export function studioCreationKindFromSearch(search: string): StudioCreationKind | null {
  const values = new URLSearchParams(search).getAll("add")
  return values.length === 1 ? parseStudioCreationKind(values[0]) : null
}

export function artifactCreationPlan(id: ArtifactTypeId): ArtifactCreationPlan {
  const plans: Record<ArtifactTypeId, ArtifactCreationPlan> = {
    note: { type: "project", href: `${viewRoutes.studio}?add=notes`, kind: "notes" },
    doc: { type: "project", href: `${viewRoutes.studio}?add=docs`, kind: "docs" },
    sheet: { type: "project", href: `${viewRoutes.studio}?add=sheets`, kind: "sheets" },
    deck: { type: "project", href: `${viewRoutes.studio}?add=slides`, kind: "slides" },
    canvas: { type: "canvas", href: `${viewRoutes.canvas}?new=1` },
    quiz: { type: "quiz", href: viewRoutes.ai },
    "live-game": { type: "live", href: viewRoutes.live },
  }
  return plans[id]
}

/** Transient Add links become ordinary lobby links before any project is made. */
export function withoutStudioCreationQuery(search: string): string {
  const params = new URLSearchParams(search)
  params.delete("add")
  const remaining = params.toString()
  return remaining ? `?${remaining}` : ""
}

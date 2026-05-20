export type CloudflareResourceKind = "worker" | "pages" | "d1" | "r2" | "ai-gateway"

export type CloudflareCleanupAction = "keep" | "review-delete" | "protected" | "unknown"

export interface CloudflareResourceLike {
  kind: CloudflareResourceKind
  name: string
  id?: string
}

export interface CloudflareCleanupDecision {
  resource: CloudflareResourceLike
  action: CloudflareCleanupAction
  reason: string
}

const protectedAppNames = ["allchess", "edsync"]

const canonicalLearnResources = new Map<CloudflareResourceKind, ReadonlySet<string>>([
  ["worker", new Set(["learn", "learn-realtime"])],
  ["pages", new Set()],
  ["d1", new Set(["learn-db"])],
  ["r2", new Set(["learn-files", "learn-next-cache"])],
  ["ai-gateway", new Set(["learn"])],
])

export function classifyCloudflareResource(resource: CloudflareResourceLike): CloudflareCleanupDecision {
  const name = normalizeCloudflareName(resource.name)

  if (isProtectedAppResource(name)) {
    return {
      resource,
      action: "protected",
      reason: "Belongs to allchess or edsync and must not be changed by LEARN cleanup.",
    }
  }

  if (canonicalLearnResources.get(resource.kind)?.has(name)) {
    return {
      resource,
      action: "keep",
      reason: "Canonical LEARN Cloudflare resource.",
    }
  }

  if (isLearnOwnedStaleCandidate(resource.kind, name)) {
    return {
      resource,
      action: "review-delete",
      reason: "Looks LEARN-owned but is not part of the canonical Worker/D1/R2 target set.",
    }
  }

  return {
    resource,
    action: "unknown",
    reason: "Does not match LEARN canonical resources or known protected apps.",
  }
}

export function buildCloudflareCleanupPlan(resources: CloudflareResourceLike[]): CloudflareCleanupDecision[] {
  return resources
    .map(classifyCloudflareResource)
    .sort((left, right) => compareCloudflareCleanupDecisions(left, right))
}

function normalizeCloudflareName(name: string): string {
  return name.trim().toLowerCase()
}

function isProtectedAppResource(name: string): boolean {
  return protectedAppNames.some((appName) => name === appName || name.startsWith(`${appName}-`) || name.includes(`-${appName}-`))
}

function isLearnOwnedStaleCandidate(kind: CloudflareResourceKind, name: string): boolean {
  if (kind === "pages" && name === "learn") {
    return true
  }

  return name.startsWith("learn-") || name === "learn-app" || name === "learn-learning-app"
}

function compareCloudflareCleanupDecisions(left: CloudflareCleanupDecision, right: CloudflareCleanupDecision): number {
  const actionOrder: Record<CloudflareCleanupAction, number> = {
    "review-delete": 0,
    keep: 1,
    protected: 2,
    unknown: 3,
  }

  return (
    actionOrder[left.action] - actionOrder[right.action] ||
    left.resource.kind.localeCompare(right.resource.kind) ||
    left.resource.name.localeCompare(right.resource.name)
  )
}

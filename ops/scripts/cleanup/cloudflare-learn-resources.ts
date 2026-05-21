import {
  buildCloudflareCleanupPlan,
  type CloudflareCleanupDecision,
  type CloudflareResourceKind,
  type CloudflareResourceLike,
} from "../../../lib/cloudflare-cleanup"

interface CloudflareListResponse {
  success?: boolean
  result?: unknown
  errors?: { message?: string }[]
}

interface CloudflareFetchTarget {
  kind: CloudflareResourceKind
  path: string
  nameFields: string[]
}

const cloudflareApiBase = "https://api.cloudflare.com/client/v4"

const fetchTargets: CloudflareFetchTarget[] = [
  { kind: "worker", path: "workers/scripts", nameFields: ["id", "name"] },
  { kind: "pages", path: "pages/projects", nameFields: ["name"] },
  { kind: "d1", path: "d1/database", nameFields: ["name"] },
  { kind: "r2", path: "r2/buckets", nameFields: ["name"] },
]

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN

  if (!accountId || !apiToken) {
    console.log("Cloudflare cleanup audit skipped: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to inventory live resources.")
    console.log("No remote resources were read or changed.")
    return
  }

  const resources = await fetchCloudflareResources({ accountId, apiToken })
  const plan = buildCloudflareCleanupPlan(resources)

  printPlan(plan)
}

async function fetchCloudflareResources({
  accountId,
  apiToken,
}: {
  accountId: string
  apiToken: string
}): Promise<CloudflareResourceLike[]> {
  const resourceGroups = await Promise.all(
    fetchTargets.map(async (target) => {
      try {
        return await fetchCloudflareResourceGroup({ accountId, apiToken, target })
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error"
        console.log(`unavailable ${target.kind} - ${message}`)
        return []
      }
    }),
  )

  return resourceGroups.flat()
}

async function fetchCloudflareResourceGroup({
  accountId,
  apiToken,
  target,
}: {
  accountId: string
  apiToken: string
  target: CloudflareFetchTarget
}): Promise<CloudflareResourceLike[]> {
  const response = await fetch(`${cloudflareApiBase}/accounts/${accountId}/${target.path}`, {
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json",
    },
  })

  const payload = (await response.json()) as CloudflareListResponse

  if (!response.ok || payload.success === false) {
    throw new Error(readCloudflareError(payload) || `HTTP ${response.status}`)
  }

  return readCloudflareItems(payload.result).flatMap((item) => {
    const name = readNameField(item, target.nameFields)
    return name ? [{ kind: target.kind, name, id: readStringField(item, "id") }] : []
  })
}

function readCloudflareItems(result: unknown): Record<string, unknown>[] {
  if (!Array.isArray(result)) return []
  return result.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
}

function readNameField(item: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = readStringField(item, field)
    if (value) return value
  }

  return null
}

function readStringField(item: Record<string, unknown>, field: string): string | null {
  const value = item[field]
  return typeof value === "string" && value.trim() ? value : null
}

function readCloudflareError(payload: CloudflareListResponse): string | null {
  const firstMessage = payload.errors?.find((error) => error.message)?.message
  return firstMessage || null
}

function printPlan(plan: CloudflareCleanupDecision[]) {
  if (plan.length === 0) {
    console.log("No Cloudflare resources were returned for this account/token scope.")
    return
  }

  const counts = summarizePlan(plan)
  console.log(
    `Cloudflare LEARN cleanup audit: ${counts.keep} keep, ${counts.reviewDelete} review-delete, ${counts.protected} protected, ${counts.unknown} unknown.`,
  )
  console.log("Dry run only. No Cloudflare resources were changed.")

  for (const item of plan) {
    console.log(`${item.action} ${item.resource.kind} ${item.resource.name} - ${item.reason}`)
  }
}

function summarizePlan(plan: CloudflareCleanupDecision[]) {
  return {
    keep: countPlanActions(plan, "keep"),
    reviewDelete: countPlanActions(plan, "review-delete"),
    protected: countPlanActions(plan, "protected"),
    unknown: countPlanActions(plan, "unknown"),
  }
}

function countPlanActions(plan: CloudflareCleanupDecision[], action: CloudflareCleanupDecision["action"]) {
  return plan.filter((item) => item.action === action).length
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

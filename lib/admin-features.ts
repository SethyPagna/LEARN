export type AdminPanelTab = "overview" | "users" | "providers" | "audit" | "automation"

export interface AdminProviderLike {
  id?: string
  name?: string
  provider?: string
  enabled?: boolean
  has_key?: boolean
  last_status?: string
  last_error?: string
  priority?: number
}

export interface AdminAuditLike {
  id?: string
  action?: string
  entity?: string
  details?: string
  created_at?: string
  user_id?: string
}

export interface AdminAutomationLike {
  key?: string
  label?: string
  description?: string
}

export interface AdminDataLike {
  users?: unknown[]
  providers?: AdminProviderLike[]
  audit?: AdminAuditLike[]
  counters?: Record<string, number>
}

export interface AdminSummaryCard {
  id: string
  label: string
  value: string
  detail: string
  tone: "good" | "watch" | "neutral"
}

export interface AdminOperationalSummary {
  cards: AdminSummaryCard[]
  providerIssues: AdminProviderLike[]
  recentAudit: AdminAuditLike[]
  visibleAutomation: AdminAutomationLike[]
  systemTone: "good" | "watch" | "neutral"
}

const MAX_ADMIN_LIST = 8

export function summarizeAdminOperations(input: {
  adminData?: AdminDataLike | null
  automationData?: { jobs?: AdminAutomationLike[]; prompts?: unknown[] } | null
}): AdminOperationalSummary {
  const adminData = input.adminData ?? {}
  const providers = adminData.providers ?? []
  const users = adminData.users ?? []
  const audit = adminData.audit ?? []
  const counters = adminData.counters ?? {}
  const providerIssues = providers
    .filter((provider) => providerNeedsAttention(provider))
    .sort((first, second) => Number(first.priority ?? 999) - Number(second.priority ?? 999))
    .slice(0, MAX_ADMIN_LIST)
  const recentAudit = audit.slice(0, MAX_ADMIN_LIST)
  const visibleAutomation = (input.automationData?.jobs ?? []).slice(0, MAX_ADMIN_LIST)
  const systemTone = providerIssues.length ? "watch" : "good"

  return {
    cards: [
      {
        id: "users",
        label: "Users",
        value: String(users.length),
        detail: "Accounts visible to admin",
        tone: "neutral",
      },
      {
        id: "providers",
        label: "Providers",
        value: `${readyProviderCount(providers)}/${providers.length}`,
        detail: providerIssues.length ? `${providerIssues.length} need attention` : "Routing looks ready",
        tone: providerIssues.length ? "watch" : "good",
      },
      {
        id: "audit",
        label: "Audit",
        value: String(audit.length || counters.events || 0),
        detail: "Recent tracked events",
        tone: "neutral",
      },
      {
        id: "automation",
        label: "Automation",
        value: String(visibleAutomation.length),
        detail: "Workflow jobs available",
        tone: visibleAutomation.length ? "good" : "neutral",
      },
    ],
    providerIssues,
    recentAudit,
    visibleAutomation,
    systemTone,
  }
}

export function filterAdminList<T extends Record<string, unknown>>(items: T[], query: string, fields: Array<keyof T>) {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  const results: T[] = []
  for (const item of items) {
    for (const field of fields) {
      if (String(item[field] ?? "").toLowerCase().includes(needle)) {
        results.push(item)
        break
      }
    }
  }
  return results
}

function readyProviderCount(providers: AdminProviderLike[]) {
  let count = 0
  for (const provider of providers) {
    if (provider.enabled && provider.has_key && provider.last_status !== "error") count += 1
  }
  return count
}

function providerNeedsAttention(provider: AdminProviderLike) {
  if (!provider.enabled) return false
  if (!provider.has_key) return true
  return provider.last_status === "error" || Boolean(provider.last_error)
}

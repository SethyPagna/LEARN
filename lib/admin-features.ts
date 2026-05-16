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

export interface AdminOperationalPlan {
  targetTab: AdminPanelTab
  headline: string
  nextAction: string
  chips: string[]
  riskCount: number
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

export function buildAdminOperationalPlan(summary: AdminOperationalSummary): AdminOperationalPlan {
  const providerCard = summary.cards.find((card) => card.id === "providers")
  const auditCard = summary.cards.find((card) => card.id === "audit")
  const automationCard = summary.cards.find((card) => card.id === "automation")
  const riskCount = summary.providerIssues.length

  if (riskCount > 0) {
    return {
      targetTab: "providers",
      headline: "Provider routing needs attention",
      nextAction: "Open provider admin",
      chips: [`${riskCount} provider issue${riskCount === 1 ? "" : "s"}`, providerCard?.value ?? "0/0 ready"],
      riskCount,
    }
  }

  if (summary.recentAudit.length === 0) {
    return {
      targetTab: "audit",
      headline: "Audit trail is quiet",
      nextAction: "Review audit setup",
      chips: [auditCard?.value ?? "0 events", "no recent rows"],
      riskCount,
    }
  }

  if (summary.visibleAutomation.length === 0) {
    return {
      targetTab: "automation",
      headline: "Automation catalog is empty",
      nextAction: "Inspect automation jobs",
      chips: [automationCard?.value ?? "0 jobs", "manual checks only"],
      riskCount,
    }
  }

  return {
    targetTab: "overview",
    headline: "Operations look ready",
    nextAction: "Review overview",
    chips: [providerCard?.value ?? "providers ready", `${summary.recentAudit.length} audit rows`, `${summary.visibleAutomation.length} jobs`],
    riskCount,
  }
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

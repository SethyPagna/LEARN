export type ProviderAdminSection = "providers" | "editor" | "routing" | "presets"

export interface ProviderAdminUiSummary {
  totalCount: number
  enabledCount: number
  readyCount: number
  hasDegradedProviders: boolean
  routingOrder: unknown[]
}

export interface ProviderAdminSummaryChip {
  id: string
  label: string
  value: string
  tone: "good" | "watch" | "neutral"
  priority: "primary" | "secondary"
  targetSection: ProviderAdminSection
}

export function buildProviderAdminSummaryChips(summary: ProviderAdminUiSummary | null): ProviderAdminSummaryChip[] {
  const totalCount = summary?.totalCount ?? 0
  const enabledCount = summary?.enabledCount ?? 0
  const readyCount = summary?.readyCount ?? 0
  const routingCount = summary?.routingOrder.length ?? 0
  const hasDegradedProviders = Boolean(summary?.hasDegradedProviders)
  const allEnabledReady = enabledCount > 0 && readyCount === enabledCount && !hasDegradedProviders

  return [
    {
      id: "health",
      label: "Health",
      value: allEnabledReady ? "Ready" : hasDegradedProviders ? "Review" : "Setup",
      tone: allEnabledReady ? "good" : hasDegradedProviders ? "watch" : "neutral",
      priority: "primary",
      targetSection: hasDegradedProviders ? "providers" : "routing",
    },
    {
      id: "ready",
      label: "Ready",
      value: `${readyCount}/${Math.max(enabledCount, totalCount)}`,
      tone: readyCount ? "good" : "watch",
      priority: "primary",
      targetSection: "providers",
    },
    {
      id: "routing",
      label: "Routing",
      value: String(routingCount),
      tone: routingCount ? "good" : "neutral",
      priority: routingCount ? "primary" : "secondary",
      targetSection: "routing",
    },
    {
      id: "enabled",
      label: "Enabled",
      value: String(enabledCount),
      tone: enabledCount ? "good" : "neutral",
      priority: "secondary",
      targetSection: "providers",
    },
    {
      id: "total",
      label: "Total",
      value: String(totalCount),
      tone: totalCount ? "neutral" : "watch",
      priority: totalCount ? "secondary" : "primary",
      targetSection: totalCount ? "providers" : "presets",
    },
  ]
}

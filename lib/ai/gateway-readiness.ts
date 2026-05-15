import type { GuidedPromptResult } from "./prompt-builder"

export interface AiGatewayProviderStatus {
  provider?: string
  enabled?: boolean
  has_key?: boolean
  last_status?: string
  name?: string
}

export interface AiGatewayReadiness {
  status: "ready" | "warning" | "blocked"
  label: string
  checks: string[]
  readyProviderCount: number
  selectedProviderCount: number
}

export function buildAiGatewayReadiness(input: {
  prompt: GuidedPromptResult
  providers: AiGatewayProviderStatus[]
  providerFamily: string
}) {
  const readyProviders = input.providers.filter(isProviderReady)
  const selectedProviders = input.providerFamily === "auto"
    ? readyProviders
    : readyProviders.filter((provider) => provider.provider === input.providerFamily)
  const checks: string[] = []

  if (!input.prompt.ok) {
    checks.push(`Missing required fields: ${input.prompt.missing.join(", ")}`)
  }
  if (input.prompt.warnings.length) {
    checks.push(...input.prompt.warnings)
  }
  if (!input.providers.length) {
    checks.push("Provider status has not been loaded yet.")
  } else if (!readyProviders.length) {
    checks.push("No enabled provider currently has a stored key and healthy status.")
  } else if (input.providerFamily !== "auto" && !selectedProviders.length) {
    checks.push(`Preferred provider family "${input.providerFamily}" is not ready; auto failover is safer.`)
  }

  const blocked = !input.prompt.ok || (input.providers.length > 0 && readyProviders.length === 0)
  const status: AiGatewayReadiness["status"] = blocked ? "blocked" : checks.length ? "warning" : "ready"
  return {
    status,
    label: status === "ready" ? "Ready to run" : status === "warning" ? "Review before run" : "Blocked",
    checks: checks.length ? checks : ["Prompt, output target, and provider route look ready."],
    readyProviderCount: readyProviders.length,
    selectedProviderCount: selectedProviders.length,
  }
}

function isProviderReady(provider: AiGatewayProviderStatus) {
  return Boolean(provider.enabled && provider.has_key && provider.last_status !== "error")
}

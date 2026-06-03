import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser } from "@/lib/api"
import {
  sanitizeAiGatewayProviderCatalog,
  sanitizeAiGatewayProviderPresets,
  sanitizeAiGatewayProviderStatuses,
} from "@/lib/ai/gateway-readiness"
import type { ProviderConfigInput } from "@/lib/ai/provider-admin"
import { listProviderMetadata, listProviderPresets } from "@/lib/ai/providers"
import { deleteAiProviderConfig, getAiProviderAdminState, listAiProviderConfigs, saveAiProviderConfig, testAiProviderConfig } from "@/lib/data"

function optionalString(value: unknown) {
  if (value === undefined || value === null) return undefined
  return String(value)
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function optionalBoolean(value: unknown) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true
    if (value.toLowerCase() === "false") return false
  }
  return undefined
}

function optionalSupportedModels(value: unknown): ProviderConfigInput["supportedModels"] | undefined {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === "string") return value
  return undefined
}

function providerInputFromBody(body: Record<string, unknown>): ProviderConfigInput & { id?: string } {
  return {
    id: optionalString(body.id),
    name: optionalString(body.name),
    provider: optionalString(body.provider),
    providerType: optionalString(body.providerType),
    accountEmail: optionalString(body.accountEmail),
    projectName: optionalString(body.projectName),
    apiKey: optionalString(body.apiKey),
    defaultModel: optionalString(body.defaultModel),
    supportedModels: optionalSupportedModels(body.supportedModels),
    endpointOverride: optionalString(body.endpointOverride),
    notes: optionalString(body.notes),
    enabled: optionalBoolean(body.enabled),
    priority: optionalNumber(body.priority),
    requestsPerMinute: optionalNumber(body.requestsPerMinute),
    maxInputChars: optionalNumber(body.maxInputChars),
    maxCompletionTokens: optionalNumber(body.maxCompletionTokens),
    timeoutMs: optionalNumber(body.timeoutMs),
    cooldownSeconds: optionalNumber(body.cooldownSeconds),
  }
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  if (user.role !== "admin") {
    const providers = await listAiProviderConfigs()
    return ok({
      items: sanitizeAiGatewayProviderStatuses(providers),
      catalog: sanitizeAiGatewayProviderCatalog(listProviderMetadata()),
      presets: sanitizeAiGatewayProviderPresets(listProviderPresets()),
    })
  }
  const state = await getAiProviderAdminState()
  return ok({
    ...state,
    catalog: listProviderMetadata(),
    presets: listProviderPresets(),
  })
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  try {
    if (body.action === "test" && body.id) return ok(await testAiProviderConfig(user, String(body.id)))
    return ok({ item: await saveAiProviderConfig(user, providerInputFromBody(body)) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to save AI provider.", user.role === "admin" ? 400 : 403)
  }
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  try {
    return ok({ item: await saveAiProviderConfig(user, providerInputFromBody(body)) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to update AI provider.", user.role === "admin" ? 400 : 403)
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  try {
    await deleteAiProviderConfig(user, new URL(request.url).searchParams.get("id") || "")
    return ok({ success: true })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to delete AI provider.", user.role === "admin" ? 400 : 403)
  }
}

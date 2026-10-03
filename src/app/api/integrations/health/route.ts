import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/data"
import { getCloudflareBindings } from "@/lib/cloudflare"
import { getDatabaseRuntimeMode, isDatabaseConfigured, query } from "@/lib/db"
import { isR2Configured } from "@/lib/storage"
import { resolveConfiguredProvider } from "@/lib/ai/providers"
import { isProviderSecretKeyConfigured } from "@/lib/ai/provider-admin"
import { withApiErrorBoundary } from "@/lib/api"

export const GET = withApiErrorBoundary(async () => {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const env = await getCloudflareBindings()
  let database = false
  try {
    database = await isDatabaseConfigured()
    if (database) await query("SELECT 1 AS ok")
  } catch {
    database = false
  }

  return NextResponse.json({
    runtime: await getDatabaseRuntimeMode(),
    database: {
      provider: "cloudflare-d1",
      configured: database,
      binding: Boolean(env?.LEARN_DB || env?.DB),
    },
    storage: {
      provider: "cloudflare-r2",
      configured: await isR2Configured(),
      binding: Boolean(env?.LEARN_FILES),
    },
    ai: {
      provider: resolveConfiguredProvider()?.provider || null,
      configured: Boolean(resolveConfiguredProvider()),
    },
    // Surfaces the Item 5 misconfiguration before it bites: without this key a
    // production deployment cannot store provider secrets at all (it now throws
    // rather than silently encrypting under the built-in development key).
    encryption: {
      providerSecretKeyConfigured: isProviderSecretKeyConfigured(),
      requiredInProduction: true,
    },
  })
})

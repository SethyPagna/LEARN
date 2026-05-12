import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/data"
import { getCloudflareBindings } from "@/lib/cloudflare"
import { isDatabaseConfigured, query } from "@/lib/db"
import { isR2Configured } from "@/lib/storage"
import { resolveConfiguredProvider } from "@/lib/ai/providers"

export async function GET() {
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
    runtime: "cloudflare-workers",
    database: {
      provider: "cloudflare-d1",
      configured: database,
      binding: Boolean(env?.LEARNING_OS_DB || env?.DB),
    },
    storage: {
      provider: "cloudflare-r2",
      configured: await isR2Configured(),
      binding: Boolean(env?.LEARNING_OS_FILES),
    },
    ai: {
      provider: resolveConfiguredProvider()?.provider || null,
      configured: Boolean(resolveConfiguredProvider()),
    },
  })
}

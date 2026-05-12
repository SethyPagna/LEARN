import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/data"
import { query } from "@/lib/db"
import { getAutomationJob } from "@/lib/automation"
import { createId } from "@/lib/schema"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null) as { jobKey?: string; input?: Record<string, unknown> } | null
  const job = body?.jobKey ? getAutomationJob(body.jobKey) : null
  if (!job) return NextResponse.json({ error: "Unknown automation job." }, { status: 400 })

  const output = {
    status: "queued",
    promptKey: job.promptKey,
    message: "Automation run was recorded. Connect a scheduled Cloudflare trigger or admin workflow to execute it.",
  }

  const runId = createId("run")
  await query(
    `INSERT INTO automation_runs (id, job_key, user_id, status, input, output)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [runId, job.key, user.id, "queued", JSON.stringify(body?.input || {}), JSON.stringify(output)],
  )

  return NextResponse.json({ run: { id: runId, jobKey: job.key, ...output } }, { status: 202 })
}

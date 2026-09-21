import { NextResponse, type NextRequest } from "next/server"
import { isApiResponse, isPlainRecord, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { query } from "@/lib/db"
import { getAutomationJob } from "@/lib/automation"
import { createId } from "@/lib/schema"

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  // requireApiUser() rather than getCurrentUser(): this is a mutation, and
  // requireApiUser applies the hasTrustedOrigin() cross-origin check that a bare
  // session lookup skips.
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const body = await readJsonObject(request)
  const jobKey = String(body.jobKey || "").trim()
  const job = jobKey ? getAutomationJob(jobKey) : null
  if (!job) return NextResponse.json({ error: "Unknown automation job." }, { status: 400 })
  const input = isPlainRecord(body.input) ? body.input : {}

  const output = {
    status: "queued",
    promptKey: job.promptKey,
    message: "Automation run was recorded. Connect a scheduled Cloudflare trigger or admin workflow to execute it.",
  }

  const runId = createId("run")
  await query(
    `INSERT INTO automation_runs (id, job_key, user_id, status, input, output)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [runId, job.key, user.id, "queued", JSON.stringify(input), JSON.stringify(output)],
  )

  return NextResponse.json({ run: { id: runId, jobKey: job.key, ...output } }, { status: 202 })
})

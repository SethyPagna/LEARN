import type { NextRequest } from "next/server"
import { isApiResponse, ok, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { automationJobs } from "@/lib/automation"
import { promptLibrary } from "@/lib/ai/prompt-library"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  return ok({
    jobs: automationJobs,
    prompts: promptLibrary.map((prompt) => ({
      key: prompt.key,
      title: prompt.title,
      outputContract: prompt.outputContract,
    })),
  })
})

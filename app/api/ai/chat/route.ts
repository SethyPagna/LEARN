import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { askTutor } from "@/lib/ai/tutor"
import { saveAiTurn } from "@/lib/data"

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const body = await request.json().catch(() => ({}))
  const message = String(body.message || "").trim()
  const context = String(body.context || "").trim()
  if (!message) return fail("Message is required.")

  try {
    const result = await askTutor({ message, context })
    const saved = await saveAiTurn({
      user,
      chatId: body.chatId ? String(body.chatId) : undefined,
      prompt: message,
      response: result.text,
      provider: result.provider,
      model: result.model,
      status: result.status,
    })
    return ok({ ...result, ...saved })
  } catch (error) {
    const text = error instanceof Error ? error.message : "AI tutor request failed."
    await saveAiTurn({ user, prompt: message, response: text, status: "error" })
    return fail(text, 502)
  }
}

import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { askTutor, type TutorMode } from "@/lib/ai/tutor"
import { saveAiTurn } from "@/lib/data"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

const tutorModes: TutorMode[] = ["coach", "rewrite", "quiz", "flashcards", "translate", "route", "cleanup", "mistake"]

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const body = await request.json().catch(() => ({}))
  const message = String(body.message || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, 4000)
  const context = String(body.context || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, 16000)
  const mode = String(body.mode || "coach").trim()
  const temperature = Number(body.temperature)
  const maxTokens = Number(body.maxTokens)
  if (!message) return fail("Message is required.")

  const limit = await checkRateLimit({
    key: `ai:${user.id}:${getClientIp(request.headers)}`,
    limit: 40,
    windowMs: 10 * 60 * 1000,
  })
  if (!limit.allowed) return fail("Too many AI requests. Try again later.", 429)

  try {
    const result = await askTutor({
      message,
      context,
      mode: tutorModes.includes(mode as TutorMode) ? mode as TutorMode : "coach",
      temperature: Number.isFinite(temperature) ? temperature : undefined,
      maxTokens: Number.isFinite(maxTokens) ? maxTokens : undefined,
    })
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

import { resolveConfiguredProvider } from "./providers"
import { getCloudflareBindings } from "../cloudflare"
import { listRuntimeAiProviderConfigs, recordAiProviderRuntimeStatus, type RuntimeAiProviderConfig } from "../data"

export interface TutorRequest {
  message: string
  context?: string
  mode?: TutorMode
  temperature?: number
  maxTokens?: number
}

export type TutorMode = "coach" | "rewrite" | "quiz" | "flashcards" | "translate" | "route" | "cleanup" | "mistake"

export async function askTutor(input: TutorRequest) {
  const cloudflareEnv = await getCloudflareBindings()
  const envProvider = resolveConfiguredProvider({ ...process.env, ...(cloudflareEnv || {}) } as Record<string, string | undefined>)
  const dbProviders = await listRuntimeAiProviderConfigs("chat").catch(() => [])
  const providers = [
    ...dbProviders,
    ...(envProvider ? [{
      id: `env:${envProvider.provider}`,
      name: envProvider.label,
      provider: envProvider.provider,
      providerType: envProvider.type === "embed" ? "embed" : "chat",
      endpoint: envProvider.endpoint,
      model: envProvider.model,
      apiKey: envProvider.apiKey,
      priority: envProvider.defaultPriority,
      requestsPerMinute: envProvider.safeRequestsPerMinute,
      maxInputChars: 1400,
      maxCompletionTokens: 1800,
      timeoutMs: envProvider.safeTimeoutMs,
      cooldownSeconds: envProvider.safeCooldownSeconds,
    } satisfies RuntimeAiProviderConfig] : []),
  ].filter((provider) => provider.providerType !== "embed")

  if (!providers.length) {
    return {
      status: "setup_required" as const,
      provider: null,
      model: null,
      text: [
        "AI tutor is ready, but no provider key is configured yet.",
        "Add one of GROQ_API_KEY, MISTRAL_API_KEY, CEREBRAS_API_KEY, GOOGLE_AI_API_KEY, COHERE_API_KEY, VERCEL_AI_GATEWAY, or CLOUDFLARE_AI_GATEWAY_TOKEN to your runtime secrets.",
        "Until then, use the notes, quizzes, and progress features offline.",
      ].join("\n\n"),
    }
  }

  const systemPrompt = [
    "You are LEARN Tutor, a concise study coach.",
    "Personalize the answer using the learner context.",
    "Prefer actionable study steps, note outlines, quiz questions, and mistake explanations.",
    getTutorModeInstruction(input.mode),
  ].join(" ")
  const userPrompt = [input.context, input.message].filter(Boolean).join("\n\n").slice(0, 16_000)
  const errors: string[] = []

  for (const provider of providers) {
    try {
      const result = await askProvider(provider, systemPrompt, userPrompt, input)
      if (!provider.id.startsWith("env:")) await recordAiProviderRuntimeStatus(provider.id, "ok").catch(() => undefined)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI request failed"
      errors.push(`${provider.name}: ${message}`)
      if (!provider.id.startsWith("env:")) await recordAiProviderRuntimeStatus(provider.id, "error", message).catch(() => undefined)
    }
  }

  throw new Error(errors[0] || "AI tutor request failed.")
}

export function getTutorModeInstruction(mode: TutorRequest["mode"]) {
  switch (mode) {
    case "rewrite":
      return "Rewrite messy notes into clean sections with headings, bullets, examples, and follow-up tasks."
    case "quiz":
      return "Generate a mixed quiz with multiple choice, true/false, fill-in-the-blank, explanations, and answer keys."
    case "flashcards":
      return "Create flashcards, matching pairs, and one small study game from the learner context."
    case "translate":
      return "Translate and localize the learning material while preserving terminology and examples."
    case "route":
      return "Build a dated learning route with review blocks, weak topics, and measurable checkpoints."
    case "cleanup":
      return "Clean imported material into structured notes with headings, tables, deduplicated ideas, and review-ready action items."
    case "mistake":
      return "Explain the learner's mistake, identify the misconception, and give a short repair drill with one memory hook."
    default:
      return "Coach the learner with concise steps, encouragement, and concrete next actions."
  }
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function withTimeout(timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, done: () => clearTimeout(timeout) }
}

async function askProvider(provider: RuntimeAiProviderConfig, systemPrompt: string, userPrompt: string, input: TutorRequest) {
  const temperature = clamp(input.temperature, 0.45, 0, 1.2)
  const maxTokens = clamp(input.maxTokens, Math.min(provider.maxCompletionTokens, 1200), 128, provider.maxCompletionTokens || 1800)
  const timeout = withTimeout(provider.timeoutMs)

  if (provider.provider === "google") {
    try {
      const response = await fetch(`${provider.endpoint}/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: timeout.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json?.error?.message || "Google AI request failed")
      return {
        status: "ok" as const,
        provider: provider.provider,
        model: provider.model,
        text: json?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text).filter(Boolean).join("\n") || "",
      }
    } finally {
      timeout.done()
    }
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]
  const usesWorkersAiGateway = provider.provider === "cloudflare" && provider.endpoint.includes("/workers-ai/")
  try {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`,
      },
      signal: timeout.signal,
      body: JSON.stringify(usesWorkersAiGateway
        ? {
            messages,
            temperature,
            max_tokens: maxTokens,
          }
        : {
            model: provider.model,
            messages,
            temperature,
            max_tokens: maxTokens,
            max_completion_tokens: maxTokens,
            stream: false,
          }),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(json?.error?.message || json?.message || "AI request failed")
    return {
      status: "ok" as const,
      provider: provider.provider,
      model: provider.model,
      text: json?.choices?.[0]?.message?.content || json?.result?.response || json?.response || "",
    }
  } finally {
    timeout.done()
  }
}

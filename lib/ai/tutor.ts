import { resolveConfiguredProvider } from "./providers"

export interface TutorRequest {
  message: string
  context?: string
}

export async function askTutor(input: TutorRequest) {
  const provider = resolveConfiguredProvider()
  if (!provider) {
    return {
      status: "setup_required" as const,
      provider: null,
      model: null,
      text: [
        "AI tutor is ready, but no provider key is configured yet.",
        "Add one of GROQ_API_KEY, MISTRAL_API_KEY, CEREBRAS_API_KEY, GOOGLE_AI_API_KEY, COHERE_API_KEY, or VERCEL_AI_GATEWAY to your runtime secrets.",
        "Until then, use the notes, quizzes, and progress features offline.",
      ].join("\n\n"),
    }
  }

  const systemPrompt = [
    "You are Learning OS Tutor, a concise study coach.",
    "Personalize the answer using the learner context.",
    "Prefer actionable study steps, note outlines, quiz questions, and mistake explanations.",
  ].join(" ")
  const userPrompt = [input.context, input.message].filter(Boolean).join("\n\n")

  if (provider.provider === "google") {
    const response = await fetch(`${provider.endpoint}/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.45, maxOutputTokens: 1200 },
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
  }

  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.45,
      max_tokens: 1200,
      max_completion_tokens: 1200,
      stream: false,
    }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json?.error?.message || json?.message || "AI request failed")
  return {
    status: "ok" as const,
    provider: provider.provider,
    model: provider.model,
    text: json?.choices?.[0]?.message?.content || "",
  }
}

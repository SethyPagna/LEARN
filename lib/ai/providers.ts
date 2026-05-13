export type AiProviderKey = "groq" | "mistral" | "cerebras" | "google" | "cohere" | "vercel" | "cloudflare"

export interface AiProviderMetadata {
  provider: AiProviderKey
  label: string
  envKey: string
  defaultModel: string
  endpoint: string
  type: "chat" | "embed" | "gateway"
  supportedTypes: Array<"chat" | "embed" | "gateway">
  defaultPriority: number
  safeRequestsPerMinute: number
  safeTimeoutMs: number
  safeCooldownSeconds: number
  notes: string
}

export interface RuntimeEnv {
  [key: string]: string | undefined
}

const PROVIDERS: Record<AiProviderKey, AiProviderMetadata> = {
  groq: {
    provider: "groq",
    label: "Groq",
    envKey: "GROQ_API_KEY",
    defaultModel: "groq/compound",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    type: "chat",
    supportedTypes: ["chat"],
    defaultPriority: 10,
    safeRequestsPerMinute: 18,
    safeTimeoutMs: 18_000,
    safeCooldownSeconds: 20,
    notes: "Fast OpenAI-compatible chat for study planning, quiz generation, and note cleanup.",
  },
  mistral: {
    provider: "mistral",
    label: "Mistral AI",
    envKey: "MISTRAL_API_KEY",
    defaultModel: "mistral-small-latest",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    type: "chat",
    supportedTypes: ["chat"],
    defaultPriority: 30,
    safeRequestsPerMinute: 10,
    safeTimeoutMs: 18_000,
    safeCooldownSeconds: 25,
    notes: "Balanced chat model for tutoring, multilingual explanations, and document cleanup.",
  },
  cerebras: {
    provider: "cerebras",
    label: "Cerebras",
    envKey: "CEREBRAS_API_KEY",
    defaultModel: "llama3.1-8b",
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    type: "chat",
    supportedTypes: ["chat"],
    defaultPriority: 40,
    safeRequestsPerMinute: 12,
    safeTimeoutMs: 14_000,
    safeCooldownSeconds: 25,
    notes: "Low-latency chat for quick feedback loops and short study prompts.",
  },
  google: {
    provider: "google",
    label: "Google AI",
    envKey: "GOOGLE_AI_API_KEY",
    defaultModel: "gemini-flash-latest",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    type: "chat",
    supportedTypes: ["chat"],
    defaultPriority: 20,
    safeRequestsPerMinute: 14,
    safeTimeoutMs: 17_000,
    safeCooldownSeconds: 20,
    notes: "Google Gemini-style tutor responses with strong general study assistance.",
  },
  cohere: {
    provider: "cohere",
    label: "Cohere",
    envKey: "COHERE_API_KEY",
    defaultModel: "embed-english-v3.0",
    endpoint: "https://api.cohere.com/v2/embed",
    type: "embed",
    supportedTypes: ["embed"],
    defaultPriority: 90,
    safeRequestsPerMinute: 20,
    safeTimeoutMs: 12_000,
    safeCooldownSeconds: 20,
    notes: "Embedding provider for future semantic search, clustering, and recommendation features.",
  },
  vercel: {
    provider: "vercel",
    label: "Vercel AI Gateway",
    envKey: "VERCEL_AI_GATEWAY",
    defaultModel: "openai/gpt-5.2",
    endpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
    type: "gateway",
    supportedTypes: ["chat", "gateway"],
    defaultPriority: 60,
    safeRequestsPerMinute: 12,
    safeTimeoutMs: 20_000,
    safeCooldownSeconds: 20,
    notes: "Optional OpenAI-compatible gateway for teams that keep Vercel in the stack.",
  },
  cloudflare: {
    provider: "cloudflare",
    label: "Cloudflare AI Gateway",
    envKey: "CLOUDFLARE_AI_GATEWAY_TOKEN",
    defaultModel: "@cf/meta/llama-3.1-8b-instruct",
    endpoint: "https://gateway.ai.cloudflare.com/v1",
    type: "gateway",
    supportedTypes: ["chat", "gateway"],
    defaultPriority: 50,
    safeRequestsPerMinute: 18,
    safeTimeoutMs: 18_000,
    safeCooldownSeconds: 20,
    notes: "Default Cloudflare-first gateway using the isolated LEARN account resources.",
  },
}

export interface AiProviderPreset {
  id: string
  provider: AiProviderKey
  label: string
  model: string
  type: "chat" | "embed" | "gateway"
  priority: number
  requestsPerMinute: number
  timeoutMs: number
  cooldownSeconds: number
  endpoint: string
  notes: string
}

export const PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: "groq-research",
    provider: "groq",
    label: "Groq Research",
    model: "groq/compound",
    type: "chat",
    priority: 10,
    requestsPerMinute: 18,
    timeoutMs: 18_000,
    cooldownSeconds: 20,
    endpoint: PROVIDERS.groq.endpoint,
    notes: "Best first choice for fast research-style study routes and synthesis.",
  },
  {
    id: "groq-gpt-oss",
    provider: "groq",
    label: "Groq GPT OSS",
    model: "openai/gpt-oss-120b",
    type: "chat",
    priority: 12,
    requestsPerMinute: 16,
    timeoutMs: 18_000,
    cooldownSeconds: 20,
    endpoint: PROVIDERS.groq.endpoint,
    notes: "Open-weight reasoning option for tutor explanations and quiz generation.",
  },
  {
    id: "groq-qwen",
    provider: "groq",
    label: "Groq Qwen",
    model: "qwen/qwen3-32b",
    type: "chat",
    priority: 14,
    requestsPerMinute: 16,
    timeoutMs: 18_000,
    cooldownSeconds: 20,
    endpoint: PROVIDERS.groq.endpoint,
    notes: "Strong alternate model for coding, math, and multilingual study prompts.",
  },
  {
    id: "groq-llama-scout",
    provider: "groq",
    label: "Groq Llama Scout",
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    type: "chat",
    priority: 16,
    requestsPerMinute: 16,
    timeoutMs: 18_000,
    cooldownSeconds: 20,
    endpoint: PROVIDERS.groq.endpoint,
    notes: "Fast general-purpose fallback for lightweight tutoring and drafting.",
  },
  {
    id: "google-gemini",
    provider: "google",
    label: "Google AI Gemini",
    model: PROVIDERS.google.defaultModel,
    type: "chat",
    priority: 20,
    requestsPerMinute: 14,
    timeoutMs: 17_000,
    cooldownSeconds: 20,
    endpoint: PROVIDERS.google.endpoint,
    notes: "Good fallback for broad explanations, translation, and structured study help.",
  },
  {
    id: "mistral-small",
    provider: "mistral",
    label: "Mistral Small",
    model: PROVIDERS.mistral.defaultModel,
    type: "chat",
    priority: 30,
    requestsPerMinute: 10,
    timeoutMs: 18_000,
    cooldownSeconds: 25,
    endpoint: PROVIDERS.mistral.endpoint,
    notes: "Reliable compact model for multilingual tutoring and document cleanup.",
  },
  {
    id: "cerebras-llama",
    provider: "cerebras",
    label: "Cerebras Llama",
    model: PROVIDERS.cerebras.defaultModel,
    type: "chat",
    priority: 40,
    requestsPerMinute: 12,
    timeoutMs: 14_000,
    cooldownSeconds: 25,
    endpoint: PROVIDERS.cerebras.endpoint,
    notes: "Speed-focused option for quick drills and immediate feedback.",
  },
  {
    id: "cohere-embed",
    provider: "cohere",
    label: "Cohere Embeddings",
    model: PROVIDERS.cohere.defaultModel,
    type: "embed",
    priority: 90,
    requestsPerMinute: 20,
    timeoutMs: 12_000,
    cooldownSeconds: 20,
    endpoint: PROVIDERS.cohere.endpoint,
    notes: "Embedding-only option for semantic search and recommendations.",
  },
]

export function getProviderMetadata(provider: string) {
  return PROVIDERS[provider.toLowerCase() as AiProviderKey] ?? null
}

export function listProviderMetadata() {
  return Object.values(PROVIDERS)
}

export function listProviderPresets() {
  return PROVIDER_PRESETS
}

export function resolveConfiguredProvider(env: RuntimeEnv = process.env) {
  const preferred = getProviderMetadata(env.AI_PROVIDER_DEFAULT || "")
  const candidates = preferred
    ? [preferred, ...listProviderMetadata().filter((provider) => provider.provider !== preferred.provider)]
    : listProviderMetadata()

  for (const provider of candidates) {
    const apiKey = env[provider.envKey]
    if (apiKey?.trim()) {
      const model = env[`${provider.envKey}_MODEL`] || provider.defaultModel
      const endpoint = provider.provider === "cloudflare"
        ? env.CLOUDFLARE_AI_GATEWAY_URL
          || (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_GATEWAY_ID
            ? `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.CLOUDFLARE_AI_GATEWAY_ID}/workers-ai/${model}`
            : provider.endpoint)
        : provider.endpoint

      return {
        ...provider,
        endpoint,
        apiKey,
        model,
      }
    }
  }

  return null
}

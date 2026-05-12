export type AiProviderKey = "groq" | "mistral" | "cerebras" | "google" | "cohere" | "vercel" | "cloudflare"

export interface AiProviderMetadata {
  provider: AiProviderKey
  label: string
  envKey: string
  defaultModel: string
  endpoint: string
  type: "chat" | "embed" | "gateway"
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
  },
  mistral: {
    provider: "mistral",
    label: "Mistral AI",
    envKey: "MISTRAL_API_KEY",
    defaultModel: "mistral-small-latest",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    type: "chat",
  },
  cerebras: {
    provider: "cerebras",
    label: "Cerebras",
    envKey: "CEREBRAS_API_KEY",
    defaultModel: "llama3.1-8b",
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    type: "chat",
  },
  google: {
    provider: "google",
    label: "Google AI",
    envKey: "GOOGLE_AI_API_KEY",
    defaultModel: "gemini-flash-latest",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    type: "chat",
  },
  cohere: {
    provider: "cohere",
    label: "Cohere",
    envKey: "COHERE_API_KEY",
    defaultModel: "embed-english-v3.0",
    endpoint: "https://api.cohere.com/v2/embed",
    type: "embed",
  },
  vercel: {
    provider: "vercel",
    label: "Vercel AI Gateway",
    envKey: "VERCEL_AI_GATEWAY",
    defaultModel: "openai/gpt-5.2",
    endpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
    type: "gateway",
  },
  cloudflare: {
    provider: "cloudflare",
    label: "Cloudflare AI Gateway",
    envKey: "CLOUDFLARE_AI_GATEWAY_TOKEN",
    defaultModel: "openai/gpt-5.2",
    endpoint: "https://gateway.ai.cloudflare.com/v1",
    type: "gateway",
  },
}

export function getProviderMetadata(provider: string) {
  return PROVIDERS[provider.toLowerCase() as AiProviderKey] ?? null
}

export function listProviderMetadata() {
  return Object.values(PROVIDERS)
}

export function resolveConfiguredProvider(env: RuntimeEnv = process.env) {
  const preferred = getProviderMetadata(env.AI_PROVIDER_DEFAULT || "")
  const candidates = preferred
    ? [preferred, ...listProviderMetadata().filter((provider) => provider.provider !== preferred.provider)]
    : listProviderMetadata()

  for (const provider of candidates) {
    const apiKey = env[provider.envKey]
    if (apiKey?.trim()) {
      const endpoint = provider.provider === "cloudflare"
        ? env.CLOUDFLARE_AI_GATEWAY_URL
          || (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_GATEWAY_ID
            ? `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.CLOUDFLARE_AI_GATEWAY_ID}/compat/chat/completions`
            : provider.endpoint)
        : provider.endpoint

      return {
        ...provider,
        endpoint,
        apiKey,
        model: env[`${provider.envKey}_MODEL`] || provider.defaultModel,
      }
    }
  }

  return null
}

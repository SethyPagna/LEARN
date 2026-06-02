const DEFAULT_BASE_URL = "https://learn.learn-app.workers.dev"
const REQUEST_TIMEOUT_MS = 20_000
const REQUIRED_CSS_SNIPPETS = [
  "display:flex",
  "display:grid",
  "min-height:100vh",
]
const UNSAFE_RESPONSE_PATTERNS: UnsafeResponsePattern[] = [
  { label: "Cloudflare API token", pattern: /\bcf(?:ut|k)_[A-Za-z0-9]{20,}\b/ },
  { label: "Vercel token", pattern: /\bvck_[A-Za-z0-9]{20,}\b/ },
  { label: "Groq API key", pattern: /\bgsk_[A-Za-z0-9]{20,}\b/ },
  { label: "Cerebras API key", pattern: /\bcsk-[A-Za-z0-9]{20,}\b/ },
  { label: "Google AI API key", pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { label: "Next.js application error", pattern: /Application error/i },
  { label: "server error text", pattern: /Internal Server Error/i },
]
const ROUTES_TO_CHECK: RouteExpectation[] = [
  {
    markers: ["LEARN", "Vault to practice", "View workflow"],
    path: "/",
  },
  {
    markers: ["Workspace access", "Sign in", "Request access"],
    path: "/login",
  },
  {
    markers: ["Dashboard", "Route", "AI suggestion"],
    path: "/dashboard",
  },
  {
    markers: ["Studio", "All projects", "Templates"],
    path: "/studio",
  },
  {
    markers: ["Social", "Friends", "Find people"],
    path: "/social",
  },
  {
    markers: ["Practice", "Quiz bank", "Games"],
    path: "/practice",
  },
  {
    markers: ["AI tutor", "Task", "Gateway"],
    path: "/ai",
  },
  {
    expectedJsonKeys: ["databaseConfigured", "user"],
    path: "/api/auth/session",
  },
  {
    expectedStatus: 403,
    expectedJsonKeys: ["error"],
    markers: ["Admin access required"],
    path: "/api/integrations/health",
  },
]

interface FetchTextResult {
  body: string
  contentType: string
  status: number
  url: string
}

interface RouteExpectation {
  expectedJsonKeys?: string[]
  expectedStatus?: number
  markers?: string[]
  path: string
}

interface UnsafeResponsePattern {
  label: string
  pattern: RegExp
}

function fail(message: string): never {
  console.error(`Cloudflare smoke check failed: ${message}`)
  process.exit(1)
}

function normalizeBaseUrl(rawBaseUrl: string | undefined) {
  const baseUrl = new URL(rawBaseUrl || DEFAULT_BASE_URL)
  baseUrl.pathname = ""
  baseUrl.search = ""
  baseUrl.hash = ""
  return baseUrl.toString().replace(/\/$/, "")
}

async function fetchText(url: string): Promise<FetchTextResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal })
    const body = await response.text()
    return {
      body,
      contentType: response.headers.get("content-type") || "",
      status: response.status,
      url,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function findCssPaths(html: string) {
  const matches = html.matchAll(/href="([^"]+\.css[^"]*)"/g)
  return [...new Set([...matches].map((match) => match[1]).filter(Boolean))]
}

function absoluteUrl(baseUrl: string, routeOrPath: string) {
  return new URL(routeOrPath, baseUrl).toString()
}

function parseJsonObject(routePath: string, body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // The caller reports a route-specific failure below.
  }

  fail(`${routePath} did not return a JSON object`)
}

function checkUnsafeOutput(routePath: string, body: string) {
  const match = UNSAFE_RESPONSE_PATTERNS.find((entry) => entry.pattern.test(body))
  if (match) {
    fail(`${routePath} leaked ${match.label}`)
  }
}

async function checkRoutes(baseUrl: string) {
  for (const route of ROUTES_TO_CHECK) {
    const result = await fetchText(absoluteUrl(baseUrl, route.path))
    const expectedStatus = route.expectedStatus || 200
    if (result.status !== expectedStatus) {
      fail(`${route.path} returned ${result.status}; expected ${expectedStatus}`)
    }
    checkUnsafeOutput(route.path, result.body)

    if (expectedStatus === 200 && route.path !== "/api/auth/session" && result.body.trim().length < 100) {
      fail(`${route.path} returned an unexpectedly small response`)
    }

    const missingMarkers = (route.markers || []).filter((marker) => !result.body.includes(marker))
    if (missingMarkers.length > 0) {
      fail(`${route.path} is missing expected content: ${missingMarkers.join(", ")}`)
    }

    if (route.expectedJsonKeys) {
      if (!result.contentType.includes("application/json")) {
        fail(`${route.path} returned ${result.contentType || "no content type"} instead of JSON`)
      }

      const jsonObject = parseJsonObject(route.path, result.body)
      const missingKeys = route.expectedJsonKeys.filter((key) => !(key in jsonObject))
      if (missingKeys.length > 0) {
        fail(`${route.path} JSON is missing ${missingKeys.join(", ")}`)
      }
    }
  }
}

async function checkCss(baseUrl: string) {
  const home = await fetchText(baseUrl)
  const cssPaths = findCssPaths(home.body)
  if (cssPaths.length === 0) {
    fail("home page did not link any CSS files")
  }

  const cssResults = await Promise.all(cssPaths.map((cssPath) => fetchText(absoluteUrl(baseUrl, cssPath))))
  for (const result of cssResults) {
    if (result.status !== 200) {
      fail(`${result.url} returned ${result.status}`)
    }
    if (!result.contentType.includes("text/css")) {
      fail(`${result.url} returned ${result.contentType || "no content type"}`)
    }
    if (result.body.includes("@apply")) {
      fail(`${result.url} contains raw @apply`)
    }
  }

  const combinedCss = cssResults.map((result) => result.body).join("\n")
  const missingSnippets = REQUIRED_CSS_SNIPPETS.filter((snippet) => !combinedCss.includes(snippet))
  if (missingSnippets.length > 0) {
    fail(`live CSS is missing ${missingSnippets.join(", ")}`)
  }
}

async function checkFavicon(baseUrl: string) {
  const response = await fetch(absoluteUrl(baseUrl, "/favicon.ico"), {
    method: "HEAD",
  })
  if (response.status !== 200) {
    fail(`/favicon.ico returned ${response.status}`)
  }
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.LEARN_SMOKE_BASE_URL)

  await checkRoutes(baseUrl)
  await checkCss(baseUrl)
  await checkFavicon(baseUrl)

  console.log(`Cloudflare smoke check passed for ${baseUrl}.`)
}

void main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})

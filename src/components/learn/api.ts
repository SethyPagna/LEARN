export const PROJECTS_CHANGED_EVENT = "learn:projects-changed"

/** Shown instead of the browser's own words for a dropped connection. */
export const OFFLINE_MESSAGE = "No connection. Try again."

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = options?.body instanceof FormData
    ? options.headers
    : { "content-type": "application/json", ...(options?.headers || {}) }

  let response: Response
  try {
    response = await fetch(path, { ...options, headers })
  } catch (error) {
    // Browsers report a dropped connection as a bare TypeError ("Failed to fetch",
    // "Load failed"). An abort is a DOMException and passes through untouched.
    if (error instanceof TypeError) throw new Error(OFFLINE_MESSAGE)
    throw error
  }
  const json = await response.json().catch(() => ({}))
  if (response.status === 401) {
    const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}`)
    window.location.href = `/login?redirect=${redirect}`
    throw new Error("Please sign in.")
  }
  if (!response.ok) throw new Error(json.error || "Request failed.")
  if (typeof window !== "undefined" && /^(POST|PUT|PATCH|DELETE)$/i.test(options?.method || "GET") && /^\/api\/(canvas|docs|slides|sheets)(\?|$)/.test(path)) {
    window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT))
  }
  return json
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value))
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

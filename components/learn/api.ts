export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = options?.body instanceof FormData
    ? options.headers
    : { "content-type": "application/json", ...(options?.headers || {}) }

  const response = await fetch(path, { ...options, headers })
  const json = await response.json().catch(() => ({}))
  if (response.status === 401) {
    const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}`)
    window.location.href = `/login?redirect=${redirect}`
    throw new Error("Please sign in.")
  }
  if (!response.ok) throw new Error(json.error || "Request failed.")
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

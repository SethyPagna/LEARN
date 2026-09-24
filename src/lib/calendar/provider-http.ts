const MAX_RESPONSE_BYTES = 8 * 1024 * 1024

export async function calendarFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try { response = await fetch(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) }) }
  catch { throw new Error("Calendar provider is unavailable. Try again shortly.") }
  if (response.status === 401) throw new Error("Reconnect this calendar account to continue.")
  if (response.status === 403) throw new Error("This calendar account does not allow that action.")
  if (response.status === 412) throw new Error("This event changed in another app. Close it and reopen the latest version.")
  if (response.status === 429) throw new Error("The calendar provider is busy. Updates will retry automatically.")
  if (!response.ok) throw new Error(`Calendar provider could not complete this action (${response.status}).`)
  return response
}

export async function calendarResponseText(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return ""
  let bytes = 0, text = ""
  const decoder = new TextDecoder()
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("Calendar response is too large. Choose a smaller date range.")
      text += decoder.decode(part.value, { stream: true })
    }
    return text + decoder.decode()
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export async function calendarJson<T>(url: string, init?: RequestInit): Promise<T> {
  return JSON.parse(await calendarResponseText(await calendarFetch(url, init))) as T
}

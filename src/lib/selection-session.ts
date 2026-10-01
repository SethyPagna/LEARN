import type { FetchJson } from "./select-actions"

/** A single account owns the cached request, including while it is unresolved. */
export function createSelectionCache<T>(ttlMs: number) {
  let cached: { userId: string; at: number; value: Promise<T> } | null = null
  return {
    load(userId: string, load: () => Promise<T>) {
      if (!cached || cached.userId !== userId || Date.now() - cached.at > ttlMs) {
        cached = { userId, at: Date.now(), value: load() }
      }
      return cached.value
    },
    invalidate(userId: string) {
      if (cached?.userId === userId) cached = null
    },
  }
}

/** Already-started writes may finish; a cancelled action cannot start another request. */
export function guardSelectionFetch(fetchJson: FetchJson, isCurrent: () => boolean): FetchJson {
  return async <T>(path: string, init?: RequestInit): Promise<T> => {
    if (!isCurrent()) throw new Error("Selection action cancelled.")
    return fetchJson<T>(path, init)
  }
}

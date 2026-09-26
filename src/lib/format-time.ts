/**
 * Short, human times for lists (notifications, chats): "now", "5m", "3h",
 * "Tue", "12 Mar", "12 Mar 2024". Pure so the same helper renders the same
 * string on the server and in the browser for a given `now`.
 */
export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()) {
  if (!iso) return ""
  const time = parseServerTime(iso)
  const stamp = time.getTime()
  if (Number.isNaN(stamp)) return ""
  const seconds = Math.round((now.getTime() - stamp) / 1000)
  if (seconds < 45) return "now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return time.toLocaleDateString(undefined, { weekday: "short" })
  if (time.getFullYear() === now.getFullYear()) return time.toLocaleDateString(undefined, { day: "numeric", month: "short" })
  return time.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

/** "12:04" in the viewer's locale, for message bubbles. */
export function formatClockTime(iso: string | null | undefined) {
  if (!iso) return ""
  const time = parseServerTime(iso)
  if (Number.isNaN(time.getTime())) return ""
  return time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

/** SQLite CURRENT_TIMESTAMP is UTC even though it omits the zone suffix. */
export function parseServerTime(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value)
}

import { sanitizeImageUrl } from "../studio/canvas-styles"

/** Store same-site pictures as portable paths that both the screen and export can load. */
export function normalizeDesignPictureUrl(raw: string, origin: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (/^data:/i.test(value)) return sanitizeImageUrl(value)
  try {
    const site = new URL(origin).origin
    const source = new URL(value, site)
    if (source.origin !== site || source.username || source.password || source.pathname.startsWith("//") || !sanitizeImageUrl(source.href)) return null
    return `${source.pathname}${source.search}${source.hash}`
  } catch {
    return null
  }
}

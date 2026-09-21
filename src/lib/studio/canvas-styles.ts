/**
 * The value validators every canvas surface needs before writing a stored style
 * or an image URL into the DOM.
 *
 * A canvas document is stored JSON that can arrive from a share link, an
 * import, or a previous version of the editor, so nothing in `element.style` or
 * `element.content` is trusted. `canvas-editor.tsx` and the read-only share
 * preview both render that document, so the rules live here once rather than
 * once per renderer — a value that is refused in the editor must be refused in
 * the preview, and the only way to guarantee that is to share the check.
 *
 * Pure and environment-free apart from `sanitizeImageUrl`'s origin fallback: no
 * React, no DOM access, no clock.
 */

const COLOR_PATTERN = /^(#[0-9a-f]{3,8}|(?:rgb|hsl|oklch|oklab|color-mix)\([^)]{0,120}\)|[a-z]{3,20})$/i

/** A CSS colour from the document, or `undefined` when it is not one. */
export function safeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length <= 120 && COLOR_PATTERN.test(trimmed) ? trimmed : undefined
}

/** A finite number clamped into `[min, max]`, or `undefined` when it is not one. */
export function safeNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, value))
}

/**
 * Only same-origin, `data:image/*` and absolute http(s) URLs are accepted. The
 * app's CSP additionally restricts `img-src` to `'self' data: blob:`, so a
 * remote image shows its placeholder until the policy allows it — the URL is
 * still preserved in the document rather than silently dropped.
 */
export function sanitizeImageUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value || value.length > 2048) return null
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(value)) return value
  try {
    const url = new URL(value, typeof window === "undefined" ? "https://learn.local" : window.location.origin)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

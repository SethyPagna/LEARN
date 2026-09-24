const STUDIO_PAGE_MARKER = '<hr data-studio-page="true">'
const STUDIO_PAGE_PATTERN = /<hr\b(?=[^>]*\bdata-studio-page\s*=\s*(?:"true"|'true'|true(?=[\s/>])))[^>]*>/gi

export function countRichDocumentPages(html: string) {
  if (!html.trim()) return 1
  return html.split(STUDIO_PAGE_PATTERN).length
}

export function appendRichDocumentPage(html: string, title = "New page") {
  return `${html}${STUDIO_PAGE_MARKER}<h2>${escapePageTitle(title)}</h2><p></p>`
}

export function duplicateRichDocumentLastPage(html: string) {
  const pages = html.split(STUDIO_PAGE_PATTERN)
  const lastPage = pages.at(-1)?.trim()
  if (!lastPage) return appendRichDocumentPage(html, "Duplicated page")
  return `${html}${STUDIO_PAGE_MARKER}${lastPage}`
}

function escapePageTitle(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

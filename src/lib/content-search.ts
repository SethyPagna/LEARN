export type SearchVisibility = "private" | "connections" | "public"

export interface SearchableContentRow {
  contentItemId: string
  ownerUserId: string
  itemType: string
  title: string
  summary?: string
  body?: string
  tags?: string[]
  visibility: SearchVisibility
  updatedAt: string
}

export interface ContentSearchContext {
  viewerUserId: string
  connectedUserIds?: readonly string[]
  sharedContentItemIds?: readonly string[]
}

export interface ContentSearchResult extends SearchableContentRow {
  score: number
  matchedFields: string[]
  excerpt: string
}

export function buildContentSearchText(row: Pick<SearchableContentRow, "title" | "summary" | "body" | "tags">) {
  return normalizeSearchText([row.title, row.summary || "", row.body || "", ...(row.tags || [])].join(" "))
}

export function canViewSearchRow(row: SearchableContentRow, context: ContentSearchContext) {
  if (row.ownerUserId === context.viewerUserId) return true
  if (row.visibility === "public") return true
  const connected = new Set(context.connectedUserIds || [])
  if (row.visibility === "connections" && connected.has(row.ownerUserId)) return true
  const shared = new Set(context.sharedContentItemIds || [])
  return shared.has(row.contentItemId)
}

export function rankContentSearchRows(input: {
  rows: SearchableContentRow[]
  query: string
  context: ContentSearchContext
  limit?: number
}) {
  const terms = tokenizeSearchQuery(input.query)
  const limit = Math.max(1, Math.floor(input.limit || 20))
  const results: ContentSearchResult[] = []

  for (const row of input.rows) {
    if (!canViewSearchRow(row, input.context)) continue
    const score = scoreSearchRow(row, terms)
    if (terms.length && score <= 0) continue
    results.push({
      ...row,
      score,
      matchedFields: matchedSearchFields(row, terms),
      excerpt: buildSearchExcerpt(row, terms),
    })
  }

  return results
    .sort((left, right) => right.score - left.score || Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.title.localeCompare(right.title))
    .slice(0, limit)
}

export function tokenizeSearchQuery(query: string) {
  return normalizeSearchText(query)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 12)
}

function scoreSearchRow(row: SearchableContentRow, terms: string[]) {
  if (!terms.length) return 1
  let score = 0
  const fields = {
    title: normalizeSearchText(row.title),
    tags: normalizeSearchText((row.tags || []).join(" ")),
    summary: normalizeSearchText(row.summary || ""),
    body: normalizeSearchText(row.body || ""),
  }

  for (const term of terms) {
    if (fields.title === term) score += 18
    if (fields.title.includes(term)) score += 10
    if (fields.tags.includes(term)) score += 7
    if (fields.summary.includes(term)) score += 4
    if (fields.body.includes(term)) score += 1
  }

  return score
}

function matchedSearchFields(row: SearchableContentRow, terms: string[]) {
  const fields = [
    ["title", row.title],
    ["tags", (row.tags || []).join(" ")],
    ["summary", row.summary || ""],
    ["body", row.body || ""],
  ] as const
  const matches: string[] = []
  for (const [field, value] of fields) {
    const normalized = normalizeSearchText(value)
    if (!terms.length || terms.some((term) => normalized.includes(term))) matches.push(field)
  }
  return matches
}

function buildSearchExcerpt(row: SearchableContentRow, terms: string[]) {
  const fallback = row.summary || row.body || row.title
  const haystack = `${row.summary || ""} ${row.body || ""}`.trim()
  const lower = haystack.toLowerCase()
  const matchIndex = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0]
  if (matchIndex === undefined) return fallback.slice(0, 180)
  const start = Math.max(0, matchIndex - 60)
  return haystack.slice(start, start + 180).trim()
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s_-]+/gu, " ").replace(/\s+/g, " ").trim()
}

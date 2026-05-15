export interface NavigationItemLike<TView extends string = string> {
  view: TView
  aliases?: readonly TView[]
}

export interface NavigationGroupLike<TView extends string = string> {
  label: string
  caption?: string
  items: readonly NavigationItemLike<TView>[]
}

export interface NavigationSearchCandidate<TValue> {
  value: TValue
  label: string
  detail: string
  keywords?: readonly string[]
}

export interface NavigationGroupSummary<TView extends string = string> {
  groupLabel: string
  caption: string
  activeView?: TView
  activeItemIndex: number
}

const EXACT_MATCH_SCORE = 100
const PREFIX_MATCH_SCORE = 50
const LABEL_MATCH_SCORE = 30
const KEYWORD_MATCH_SCORE = 20
const DETAIL_MATCH_SCORE = 10

export function viewBelongsToNavigationItem<TView extends string>(view: TView, item: NavigationItemLike<TView>) {
  return item.view === view || Boolean(item.aliases?.includes(view))
}

export function summarizeActiveNavigationGroup<TView extends string>(
  view: TView,
  groups: readonly NavigationGroupLike<TView>[],
): NavigationGroupSummary<TView> | null {
  for (const group of groups) {
    const activeItemIndex = group.items.findIndex((item) => viewBelongsToNavigationItem(view, item))
    if (activeItemIndex >= 0) {
      return {
        groupLabel: group.label,
        caption: group.caption ?? "",
        activeView: group.items[activeItemIndex]?.view,
        activeItemIndex,
      }
    }
  }

  return null
}

export function formatNavigationBadge(count: number, singular: string, plural: string) {
  if (count <= 0) return ""
  return `${count} ${count === 1 ? singular : plural}`
}

export function rankNavigationMatches<TValue>(
  query: string,
  candidates: readonly NavigationSearchCandidate<TValue>[],
  limit = 6,
): NavigationSearchCandidate<TValue>[] {
  const needle = normalizeSearchText(query)
  if (!needle) return candidates.slice(0, limit)

  const scored: Array<{ candidate: NavigationSearchCandidate<TValue>; score: number }> = []
  for (const candidate of candidates) {
    const score = scoreNavigationCandidate(needle, candidate)
    if (score > 0) scored.push({ candidate, score })
  }

  scored.sort((left, right) => right.score - left.score || left.candidate.label.localeCompare(right.candidate.label))
  return scored.slice(0, limit).map((entry) => entry.candidate)
}

function scoreNavigationCandidate<TValue>(needle: string, candidate: NavigationSearchCandidate<TValue>) {
  const label = normalizeSearchText(candidate.label)
  const detail = normalizeSearchText(candidate.detail)
  const keywords = normalizeSearchText((candidate.keywords ?? []).join(" "))
  let score = 0

  if (label === needle) score += EXACT_MATCH_SCORE
  if (label.startsWith(needle)) score += PREFIX_MATCH_SCORE
  if (label.includes(needle)) score += LABEL_MATCH_SCORE
  if (keywords.includes(needle)) score += KEYWORD_MATCH_SCORE
  if (detail.includes(needle)) score += DETAIL_MATCH_SCORE

  return score
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase()
}

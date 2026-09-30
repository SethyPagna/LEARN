import type { ReactNode } from "react"
import { isSafeUrl } from "@/lib/ai/format-response"
import { decodeEntities } from "@/lib/export/html-blocks"

const MAX_INLINE_MARKUP = 200
const INLINE_MARKUP = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|~~([^~\n]+)~~|\[([^\]\n]+)\]\(([^\s)]+)\)/g

/** Markdown fragments become React nodes; source text never becomes HTML. */
export function InlineMarkdown({ text }: { text: string }) {
  const fragments: ReactNode[] = []
  let cursor = 0
  let count = 0
  for (const match of text.matchAll(INLINE_MARKUP)) {
    if (count >= MAX_INLINE_MARKUP) break
    const index = match.index ?? 0
    fragments.push(text.slice(cursor, index))
    const [, code, strong, emphasis, strike, label, url] = match
    const key = index
    if (code !== undefined) fragments.push(<code key={key}>{decodeEntities(code)}</code>)
    else if (strong !== undefined) fragments.push(<strong key={key}>{strong}</strong>)
    else if (emphasis !== undefined) fragments.push(<em key={key}>{emphasis}</em>)
    else if (strike !== undefined) fragments.push(<s key={key}>{strike}</s>)
    else if (isSafeUrl(url) && /^https?:\/\//i.test(url)) fragments.push(<a key={key} href={url} className="underline underline-offset-2" rel="noreferrer">{label}</a>)
    else fragments.push(label)
    cursor = index + match[0].length
    count += 1
  }
  fragments.push(text.slice(cursor))
  return <>{fragments}</>
}

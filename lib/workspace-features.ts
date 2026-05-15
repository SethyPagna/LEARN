export interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
}

export interface SheetDocument {
  cells: string[][]
}

export function createHistoryState<T>(present: T): HistoryState<T> {
  return {
    past: [],
    present,
    future: [],
  }
}

export function pushHistory<T>(state: HistoryState<T>, nextPresent: T): HistoryState<T> {
  if (Object.is(state.present, nextPresent)) return state
  return {
    past: [...state.past, state.present],
    present: nextPresent,
    future: [],
  }
}

export function undoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  const previous = state.past.at(-1)
  if (previous === undefined) return state
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  }
}

export function redoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  const next = state.future[0]
  if (next === undefined) return state
  return {
    past: [...state.past, state.present],
    present: next,
    future: state.future.slice(1),
  }
}

export function importCsvToSheet(csv: string): SheetDocument {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    const nextChar = csv[index + 1]

    if (char === '"' && quoted && nextChar === '"') {
      cell += '"'
      index += 1
      continue
    }

    if (char === '"') {
      quoted = !quoted
      continue
    }

    if (char === "," && !quoted) {
      row.push(cell)
      cell = ""
      continue
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && nextChar === "\n") index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      continue
    }

    cell += char
  }

  row.push(cell)
  rows.push(row)

  return { cells: rows }
}

function formatCsvCell(value: string) {
  const text = String(value ?? "")
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function exportSheetToCsv(sheet: SheetDocument) {
  return sheet.cells.map((row) => row.map(formatCsvCell).join(",")).join("\n")
}

export function stripHtmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

export function summarizeDocumentHtml(html: string) {
  const text = stripHtmlToText(html)
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0
  const headings = Array.from(html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)).map((match) => ({
    level: Number(match[1]),
    title: stripHtmlToText(match[2] || ""),
  })).filter((heading) => heading.title)

  return {
    characters: text.length,
    words,
    readingMinutes: Math.max(1, Math.ceil(words / 220)),
    headings,
  }
}

export function replaceTextInHtml(html: string, find: string, replacement: string) {
  if (!find) return { html, count: 0 }
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(escaped, "g")
  let count = 0
  const nextHtml = html.replace(pattern, () => {
    count += 1
    return replacement
  })
  return { html: nextHtml, count }
}

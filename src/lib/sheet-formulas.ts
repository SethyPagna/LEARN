const MAX_FORMULA_LENGTH = 2_000
const MAX_DEPENDENCY_DEPTH = 128
const MAX_CELL_READS = 10_000

type SheetFunction = "SUM" | "AVERAGE" | "MIN" | "MAX" | "COUNT"
type CellPosition = { row: number; column: number }
type Calculation = { ok: true; value: number | null; reason: string } | { ok: false; value: null; reason: string }
type EvaluationContext = { path: Set<string>; depth: number; work: { reads: number } }

export type SheetFormulaResult = { ok: boolean; value: string; reason: string }

export interface SheetFormulaRange {
  rowCount: number
  /** Zero-based destination row, omitted from the aggregate to avoid a cycle. */
  excludedRow?: number
}

export interface SheetFormulaEvaluator {
  evaluateFormula(formula: string): SheetFormulaResult
  evaluateCell(position: CellPosition): SheetFormulaResult
}

export function buildSheetFormula(functionName: SheetFunction, columnIndex: number, range: number | SheetFormulaRange): string {
  const column = columnIndexToName(columnIndex)
  const { rowCount, excludedRow } = typeof range === "number" ? { rowCount: Math.max(2, range), excludedRow: undefined } : range
  const endRow = Math.max(1, rowCount)
  const destination = excludedRow === undefined ? 0 : excludedRow + 1
  const ranges: string[] = []
  if (destination >= 2 && destination <= endRow) {
    if (destination > 2) ranges.push(`${column}2:${column}${destination - 1}`)
    if (destination < endRow) ranges.push(`${column}${destination + 1}:${column}${endRow}`)
  } else if (endRow >= 2) ranges.push(`${column}2:${column}${endRow}`)
  return `=${functionName}(${ranges.join(",")})`
}

/** Reuse one evaluator per immutable grid so shared dependencies are computed once. */
export function createSheetFormulaEvaluator(cells: readonly (readonly string[])[]): SheetFormulaEvaluator {
  const cache = new Map<string, Calculation>()

  function readCell(position: CellPosition, context: EvaluationContext): Calculation {
    const key = `${position.row}:${position.column}`
    if (context.path.has(key)) return failure("Circular reference")
    const cached = cache.get(key)
    if (cached) return cached
    const source = cells[position.row]?.[position.column] ?? ""
    let result: Calculation
    if (source.trim().startsWith("=")) {
      if (context.depth >= MAX_DEPENDENCY_DEPTH) return failure("Formula dependency limit exceeded")
      context.path.add(key)
      result = calculate(source, { ...context, depth: context.depth + 1 })
      context.path.delete(key)
    } else result = { ok: true, value: numericCell(source), reason: "Cell value" }
    // Limits depend on the current traversal; a failed branch must not poison later reads.
    if (result.ok) cache.set(key, result)
    return result
  }

  function calculate(formula: string, context: EvaluationContext): Calculation {
    if (formula.length > MAX_FORMULA_LENGTH) return failure("Formula is too long")
    const match = formula.trim().match(/^=\s*(SUM|AVERAGE|MIN|MAX|COUNT)\s*\(([^()]*)\)\s*$/i)
    if (!match) return failure("Unsupported formula")
    const functionName = match[1].toUpperCase() as SheetFunction
    const argumentsText = match[2].trim()
    const values: number[] = []
    for (const argument of argumentsText ? argumentsText.split(",") : []) {
      const references = argument.trim().split(":")
      if (references.length > 2) return failure("Invalid cell reference")
      const start = parseCellRef(references[0])
      const end = parseCellRef(references[1] ?? references[0])
      if (!start || !end) return failure("Invalid cell reference")
      // Missing cells are blank. Intersect with stored rows before walking a user range.
      const lastRow = Math.min(Math.max(start.row, end.row), cells.length - 1)
      for (let row = Math.min(start.row, end.row); row <= lastRow; row += 1) {
        context.work.reads += 1
        if (context.work.reads > MAX_CELL_READS) return failure("Formula cell limit exceeded")
        const lastColumn = Math.min(Math.max(start.column, end.column), cells[row].length - 1)
        for (let column = Math.min(start.column, end.column); column <= lastColumn; column += 1) {
          context.work.reads += 1
          if (context.work.reads > MAX_CELL_READS) return failure("Formula cell limit exceeded")
          const result = readCell({ row, column }, context)
          if (!result.ok) return result
          if (result.value !== null) values.push(result.value)
        }
      }
    }
    if (!values.length) return functionName === "AVERAGE"
      ? failure("No numeric cells to average")
      : { ok: true, value: 0, reason: "No numeric cells" }
    const value = aggregate(functionName, values)
    return Number.isFinite(value)
      ? { ok: true, value, reason: `${functionName} across ${values.length} cells` }
      : failure("Formula result is not finite")
  }

  function createContext(): EvaluationContext {
    return { path: new Set(), depth: 0, work: { reads: 0 } }
  }

  return {
    evaluateFormula: (formula) => displayResult(calculate(formula, createContext())),
    evaluateCell: (position) => {
      const source = cells[position.row]?.[position.column] ?? ""
      return source.trim().startsWith("=")
        ? displayResult(readCell(position, createContext()))
        : { ok: true, value: source, reason: "Cell value" }
    },
  }
}

export function evaluateSheetFormula(cells: string[][], formula: string): SheetFormulaResult {
  return createSheetFormulaEvaluator(cells).evaluateFormula(formula)
}

function failure(reason: string): Calculation {
  return { ok: false, value: null, reason }
}

function displayResult(result: Calculation): SheetFormulaResult {
  if (!result.ok) return { ok: false, value: "", reason: result.reason }
  const value = result.value ?? 0
  return { ok: true, value: Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, ""), reason: result.reason }
}

function aggregate(functionName: SheetFunction, values: number[]): number {
  if (functionName === "COUNT") return values.length
  if (functionName === "MIN") return values.reduce((minimum, value) => Math.min(minimum, value))
  if (functionName === "MAX") return values.reduce((maximum, value) => Math.max(maximum, value))
  const total = values.reduce((sum, value) => sum + value, 0)
  return functionName === "AVERAGE" ? total / values.length : total
}

function parseCellRef(reference: string): CellPosition | null {
  const match = reference.trim().match(/^\$?([A-Z]+)\$?([1-9]\d*)$/i)
  if (!match) return null
  const columnNumber = match[1].toUpperCase().split("").reduce((index, character) => index * 26 + character.charCodeAt(0) - 64, 0)
  const rowNumber = Number(match[2])
  return Number.isSafeInteger(columnNumber) && Number.isSafeInteger(rowNumber)
    ? { column: columnNumber - 1, row: rowNumber - 1 }
    : null
}

function numericCell(value: string): number | null {
  const source = value.trim()
  if (!source) return null
  const normalized = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(source) ? source.replaceAll(",", "") : source
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function columnIndexToName(index: number): string {
  let next = Number.isSafeInteger(index) && index >= 0 ? index + 1 : 1
  let name = ""
  while (next > 0) {
    const remainder = (next - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    next = Math.floor((next - 1) / 26)
  }
  return name
}

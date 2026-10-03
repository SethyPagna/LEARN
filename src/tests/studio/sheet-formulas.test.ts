import assert from "node:assert/strict"
import test from "node:test"
import { buildSheetFormula, createSheetFormulaEvaluator, evaluateSheetFormula } from "../../lib/sheet-formulas"

test("blank and text cells do not count as numbers in sheet aggregates", () => {
  const cells = [["20"], [""], ["   "], ["Heading"], ["40"]]
  for (const [formula, value] of [["COUNT", "2"], ["AVERAGE", "30"], ["MIN", "20"], ["MAX", "40"], ["SUM", "60"]]) {
    assert.equal(evaluateSheetFormula(cells, `=${formula}(A1:A5)`).value, value)
  }
  assert.equal(evaluateSheetFormula([["-5"], [""]], "=MAX(A1:A2)").value, "-5")
})

test("zero is numeric while empty averages report an error", () => {
  assert.equal(evaluateSheetFormula([["0"], [""], ["word"]], "=COUNT(A1:A3)").value, "1")
  assert.equal(evaluateSheetFormula([[""]], "=SUM(A1:A99)").value, "0")
  assert.deepEqual(evaluateSheetFormula([[""]], "=AVERAGE(A1:A99)"), { ok: false, value: "", reason: "No numeric cells to average" })
})

test("sheet formulas resolve other formulas without rounding their intermediate values", () => {
  const evaluator = createSheetFormulaEvaluator([["0.004"], ["=SUM(A1)"], ["=SUM(A1:A2)"]])
  assert.equal(evaluator.evaluateCell({ row: 1, column: 0 }).value, "0")
  assert.equal(evaluator.evaluateCell({ row: 2, column: 0 }).value, "0.01")
  assert.equal(evaluator.evaluateFormula("=COUNT(A1:A3)").value, "3")
})

test("shared sheet dependencies are reused and a new grid recalculates them", () => {
  let reads = 0
  const source = Object.defineProperty([], "0", { get: () => { reads += 1; return "7" } }) as string[]
  const evaluator = createSheetFormulaEvaluator([source, ["=SUM(A1)"], ["=SUM(A1:A2)"]])
  assert.equal(evaluator.evaluateFormula("=SUM(A2:A3)").value, "21")
  assert.equal(reads, 1)
  assert.equal(createSheetFormulaEvaluator([["9"], ["=SUM(A1)"], ["=SUM(A1:A2)"]]).evaluateFormula("=SUM(A2:A3)").value, "27")
})

test("direct and indirect circular references return an error", () => {
  const direct = createSheetFormulaEvaluator([["=SUM(A1)"]]).evaluateCell({ row: 0, column: 0 })
  assert.deepEqual(direct, { ok: false, value: "", reason: "Circular reference" })
  assert.equal(evaluateSheetFormula([["=SUM(A2)"], ["=SUM(A1)"]], "=SUM(A1:A2)").reason, "Circular reference")
})

test("unsupported dependencies cannot silently disappear from a total", () => {
  const result = evaluateSheetFormula([["10"], ["=MEDIAN(A1)"]], "=SUM(A1:A2)")
  assert.equal(result.ok, false)
  assert.equal(result.reason, "Unsupported formula")
})

test("reversed ranges, absolute references and whitespace resolve real numeric cells", () => {
  const cells = Array.from({ length: 4 }, (_, row) => Array.from({ length: 27 }, (_, column) => column === 26 ? String(row + 1) : ""))
  assert.equal(evaluateSheetFormula(cells, " = sum ( $aa$3 : AA1, $AA$4 ) ").value, "10")
  assert.equal(evaluateSheetFormula([["1", "2"], ["3", "4"]], "=SUM(B2:A1)").value, "10")
})

test("malformed row and column references are rejected", () => {
  for (const formula of ["=SUM(A0:A2)", "=SUM(A-1)", "=SUM(A1::A2)", "=SUM(A9007199254740993)", "=SUM(AAAAAAAAAAAAAAAAAAAA1)", "=SUM(A1,)"]) {
    assert.equal(evaluateSheetFormula([["5"]], formula).ok, false, formula)
  }
  assert.equal(evaluateSheetFormula([["5"]], "=SUM(A9007199254740991)").value, "0")
})

test("very large ranges intersect with existing sheet cells instead of allocating blanks", () => {
  assert.equal(evaluateSheetFormula([["5"], ["7", "3"]], "=SUM(A1:XFD1048576)").value, "15")
  assert.equal(evaluateSheetFormula([["5"]], "=COUNT(Z100:AA999999999)").value, "0")
})

test("sheet calculation limits return errors without poisoning later independent cells", () => {
  const cells = Array.from({ length: 150 }, (_, row) => [row === 149 ? "2" : `=SUM(A${row + 2})`])
  const evaluator = createSheetFormulaEvaluator(cells)
  assert.equal(evaluator.evaluateCell({ row: 0, column: 0 }).reason, "Formula dependency limit exceeded")
  assert.equal(evaluator.evaluateCell({ row: 130, column: 0 }).value, "2")
  assert.equal(evaluateSheetFormula([Array.from({ length: 20_000 }, () => "1")], "=SUM(A1:ZZZ1)").reason, "Formula cell limit exceeded")
  assert.equal(evaluateSheetFormula([["1"]], `=SUM(${" ".repeat(2_100)}A1)`).reason, "Formula is too long")
})

test("numeric text accepts decimal and grouped thousands but ignores malformed numbers", () => {
  const cells = [["1,200.5"], ["-.5"], ["2e2"], ["1,2"], ["0x10"]]
  assert.equal(evaluateSheetFormula(cells, "=SUM(A1:A5)").value, "1400")
  assert.equal(evaluateSheetFormula(cells, "=COUNT(A1:A5)").value, "3")
  assert.equal(evaluateSheetFormula([["1e308"], ["1e308"]], "=SUM(A1:A2)").reason, "Formula result is not finite")
})

test("formula menu ranges exclude the destination at the start, middle and end", () => {
  const cells = [["Score"], ["10"], ["20"], ["30"]]
  for (const [row, expected] of [[1, "50"], [2, "40"], [3, "30"]] as const) {
    const formula = buildSheetFormula("SUM", 0, { rowCount: cells.length, excludedRow: row })
    const next = cells.map((cellsRow, index) => index === row ? [formula] : cellsRow)
    assert.equal(createSheetFormulaEvaluator(next).evaluateCell({ row, column: 0 }).value, expected)
  }
  assert.equal(buildSheetFormula("SUM", 1, 4), "=SUM(B2:B4)")
  assert.equal(buildSheetFormula("SUM", 26, { rowCount: 2, excludedRow: 1 }), "=SUM()")
  assert.equal(evaluateSheetFormula([["header"], ["=SUM()"]], "=SUM()").value, "0")
})

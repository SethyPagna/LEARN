import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const runDir = path.resolve("ops", "run")
const wrapperPath = path.join(runDir, "bin", "pnpm.cmd")

function listBatchScripts() {
  return fs.readdirSync(runDir)
    .filter((fileName) => fileName.endsWith(".bat"))
    .map((fileName) => path.join(runDir, fileName))
}

test("Windows run scripts use the pinned pnpm wrapper", () => {
  assert.equal(fs.existsSync(wrapperPath), true)

  for (const scriptPath of listBatchScripts()) {
    const script = fs.readFileSync(scriptPath, "utf8")
    assert.doesNotMatch(script, /\bcorepack\s+pnpm\b/i, scriptPath)
    assert.doesNotMatch(script, /\bnpx\s+/i, scriptPath)
    assert.match(script, /ops\\run\\bin\\pnpm\.cmd/i, scriptPath)
  }
})

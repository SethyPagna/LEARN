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

function usesPinnedRunner(scriptPath: string, visited = new Set<string>()): boolean {
  if (visited.has(scriptPath)) return false
  visited.add(scriptPath)
  const script = fs.readFileSync(scriptPath, "utf8")
  if (/ops\\run\\bin\\pnpm\.cmd/i.test(script)) return true
  const delegates = [...script.matchAll(/call\s+"%~dp0([\w-]+\.bat)"/gi)]
  return delegates.length > 0 && delegates.every((match) => {
    const target = path.join(runDir, match[1])
    return fs.existsSync(target) && usesPinnedRunner(target, new Set(visited))
  })
}

test("Windows run scripts use the pinned pnpm wrapper", () => {
  assert.equal(fs.existsSync(wrapperPath), true)

  for (const scriptPath of listBatchScripts()) {
    const script = fs.readFileSync(scriptPath, "utf8")
    assert.doesNotMatch(script, /\bcorepack\s+pnpm\b/i, scriptPath)
    assert.doesNotMatch(script, /\bnpx\s+/i, scriptPath)
    assert.equal(usesPinnedRunner(scriptPath), true, scriptPath)
  }
})

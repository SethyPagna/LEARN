import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const publicProjectDocs = ["README.md", "docs/roadmap/plan.md", "docs/roadmap/progress.md", "docs/change-control.md"]

test("public project docs use maintainer-facing ownership language", () => {
  const disallowedTerms = [/\bCodex\b/i, /agentic workers/i]

  for (const filePath of publicProjectDocs) {
    const text = fs.readFileSync(filePath, "utf8")

    for (const term of disallowedTerms) {
      assert.equal(term.test(text), false, `${filePath} contains ${term}`)
    }
  }
})

test("README uses the pinned Wrangler command path", () => {
  const text = fs.readFileSync("README.md", "utf8")

  assert.equal(/\bnpx\s+wrangler\b/i.test(text), false)
  assert.match(text, /run\\bin\\pnpm\.cmd exec wrangler secret put SESSION_SECRET/)
})

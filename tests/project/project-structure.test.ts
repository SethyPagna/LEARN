import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const allowedRootFiles = new Set([
  ".dockerignore",
  ".gitignore",
  ".npmrc",
  "README.md",
  "components.json",
  "next-env.d.ts",
  "next.config.mjs",
  "open-next.config.ts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "postcss.config.ts",
  "tsconfig.json",
  "vercel.json",
])

const allowedRootDirectories = new Set([
  ".github",
  "app",
  "components",
  "docs",
  "lib",
  "migrations",
  "ops",
  "public",
  "run",
  "styles",
  "tests",
  "types",
  "workers",
])

const allowedDocsDirectories = new Set([
  "architecture",
  "operations",
  "roadmap",
  "superpowers",
])

const allowedJavaScriptFiles = new Set([
  "next.config.mjs",
])

function listTrackedFiles() {
  const output = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  return output.split(/\r?\n/).filter(Boolean)
}

test("tracked root files stay limited to tool entry points", () => {
  const trackedRootFiles = listTrackedFiles().filter((filePath) => !filePath.includes("/"))

  assert.deepEqual(
    trackedRootFiles.filter((filePath) => !allowedRootFiles.has(filePath)),
    [],
  )
})

test("tracked root directories stay grouped by responsibility", () => {
  const trackedRootDirectories = new Set(
    listTrackedFiles()
      .filter((filePath) => filePath.includes("/"))
      .map((filePath) => filePath.split("/")[0])
  )

  assert.deepEqual(
    [...trackedRootDirectories].filter((directory) => !allowedRootDirectories.has(directory)),
    [],
  )
})

test("tracked docs stay grouped by topic", () => {
  const trackedDocsEntries = listTrackedFiles()
    .filter((filePath) => filePath.startsWith("docs/"))
    .map((filePath) => filePath.split("/")[1])

  assert.deepEqual(
    [...new Set(trackedDocsEntries)].filter((directory) => !allowedDocsDirectories.has(directory)),
    [],
  )
})

test("GitHub workflows use current Node 24 action majors", () => {
  const workflowPaths = [
    ".github/workflows/ci.yml",
    ".github/workflows/deploy-cloudflare.yml",
  ]

  for (const workflowPath of workflowPaths) {
    const workflowText = fs.readFileSync(workflowPath, "utf8")

    assert.match(workflowText, /actions\/checkout@v6/)
    assert.match(workflowText, /actions\/setup-node@v6/)
    assert.match(workflowText, /node-version:\s*24/)
    assert.equal(workflowText.includes("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24"), false)
  }
})

test("tracked JavaScript files stay limited to framework exceptions", () => {
  const trackedJavaScriptFiles = listTrackedFiles()
    .map((filePath) => filePath.split(path.sep).join("/"))
    .filter((filePath) => /\.(?:cjs|js|mjs)$/.test(filePath))

  assert.deepEqual(
    trackedJavaScriptFiles.filter((filePath) => !allowedJavaScriptFiles.has(filePath)),
    [],
  )
})

test("Docker build context ignores generated workspace output", () => {
  const dockerIgnoreText = fs.readFileSync(".dockerignore", "utf8")
  const dockerIgnoreEntries = new Set(
    dockerIgnoreText
      .split(/\r?\n/)
      .map((entry) => entry.trim().replace(/\/$/, ""))
      .filter(Boolean)
  )

  for (const entry of [
    ".cache",
    ".next",
    ".open-next",
    ".pnpm-store",
    ".vercel",
    ".wrangler",
    ".agents",
    "node_modules",
    "output",
    "public/vendor",
  ]) {
    assert.equal(dockerIgnoreEntries.has(entry), true, `${entry} should stay out of Docker context`)
  }
})

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
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

test("tracked JavaScript files stay limited to framework exceptions", () => {
  const trackedJavaScriptFiles = listTrackedFiles()
    .map((filePath) => filePath.split(path.sep).join("/"))
    .filter((filePath) => /\.(?:cjs|js|mjs)$/.test(filePath))

  assert.deepEqual(
    trackedJavaScriptFiles.filter((filePath) => !allowedJavaScriptFiles.has(filePath)),
    [],
  )
})

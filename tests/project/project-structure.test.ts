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
  "postcss.config.mjs",
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
  "postcss.config.mjs",
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

test("Tailwind global styles explicitly scan project source files", () => {
  for (const stylesheetPath of ["app/globals.css", "styles/globals.css"]) {
    const stylesheet = fs.readFileSync(stylesheetPath, "utf8")

    assert.match(stylesheet, /@import\s+['"]tailwindcss['"]/)
    assert.match(stylesheet, /@source\s+['"]\.\.\/\*\*\/\*\.\{ts,tsx\}['"]/)
    assert.match(stylesheet, /@tailwind\s+utilities/)
  }
})

test("production builds verify generated Tailwind utilities", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>
  }
  const checkScript = fs.readFileSync("ops/scripts/test/check-built-css.ts", "utf8")

  assert.equal(packageJson.scripts?.postbuild, "tsx ops/scripts/test/check-built-css.ts")
  assert.match(checkScript, /display:flex/)
  assert.match(checkScript, /display:grid/)
  assert.match(checkScript, /@apply/)
})

test("Cloudflare smoke script verifies live routes and CSS", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>
  }
  const smokeScript = fs.readFileSync("ops/scripts/test/smoke-cloudflare.ts", "utf8")

  assert.equal(packageJson.scripts?.["smoke:cloudflare"], "tsx ops/scripts/test/smoke-cloudflare.ts")
  assert.match(smokeScript, /learn\.learn-app\.workers\.dev/)
  assert.match(smokeScript, /display:flex/)
  assert.match(smokeScript, /favicon\.ico/)
  assert.match(smokeScript, /RouteExpectation/)
  assert.match(smokeScript, /All projects/)
  assert.match(smokeScript, /Quiz bank/)
  assert.match(smokeScript, /expectedStatus/)
  assert.match(smokeScript, /expectedJsonKeys/)
  assert.match(smokeScript, /\/api\/integrations\/health/)
  assert.match(smokeScript, /Admin access required/)
  assert.match(smokeScript, /databaseConfigured/)
  assert.match(smokeScript, /application\/json/)
})

test("Cloudflare deploy workflow smokes the live Worker after deploy", () => {
  const workflowText = fs.readFileSync(".github/workflows/deploy-cloudflare.yml", "utf8")
  const deployIndex = workflowText.indexOf("corepack pnpm deploy:cloudflare")
  const smokeIndex = workflowText.indexOf("corepack pnpm smoke:cloudflare")

  assert.notEqual(deployIndex, -1)
  assert.notEqual(smokeIndex, -1)
  assert.equal(smokeIndex > deployIndex, true)
  assert.match(workflowText, /Live smoke attempt/)
})

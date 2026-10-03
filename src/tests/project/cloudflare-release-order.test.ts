import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8")

function assertOrder(source: string, stages: string[]) {
  let previous = -1
  for (const stage of stages) {
    const at = source.indexOf(stage)
    assert.ok(at > previous, `${stage} must exist after the previous release stage`)
    previous = at
  }
}

// A build failure must not leave the live database changed. Keep the hosted
// and Windows publication entry points subject to the same regression guard.
test("Cloudflare publication builds and verifies the target before migrating D1", () => {
  assertOrder(read(".github/workflows/deploy-cloudflare.yml").replaceAll("\r\n", "\n"), [
    "- name: Verify\n",
    "cloudflare.ts build",
    "cloudflare-preflight.ts",
    "pnpm db:migrate:remote",
    "cloudflare.ts upload",
    "- name: Smoke live Worker",
  ])
  assertOrder(read("ops/run/deploy-cloudflare.bat"), [
    "cloudflare.ts build",
    "cloudflare-preflight.ts",
    "pnpm.cmd db:migrate:remote",
    "cloudflare.ts upload",
    "pnpm.cmd smoke:cloudflare",
  ])
})

test("Worker upload preserves the completed build and saved local evidence", () => {
  const runner = read("ops/scripts/deploy/cloudflare.ts")
  assert.ok(!runner.includes("cleanup/local-workspace.ts"), "publication must not erase saved browser evidence")
  const upload = runner.match(/function upload\(\) \{([\s\S]*?)\n\}/)?.[1]
  assert.ok(upload, "the runner must retain its upload-only operation")
  assert.ok(!upload.includes("build()"), "upload must use the already-verified build")
  assert.ok(upload.includes("CLOUDFLARE_ACCOUNT_ID"), "upload must reject an unrelated account")
  assert.ok(upload.includes("fs.existsSync"), "upload must reject an absent completed build")
  assert.ok(read(".github/workflows/deploy-cloudflare.yml").includes("cancel-in-progress: false"))
  const defaultDeploy = runner.slice(runner.indexOf('case "deploy":'))
  assertOrder(defaultDeploy, ["build()", "cloudflare-preflight.ts", '"d1", "migrations", "apply"', "upload()"])
  assert.ok(read(".github/workflows/deploy-cloudflare.yml").includes("cloudflare-release-summary.json"),
    "retain nonsecret preflight metadata even if a later stage fails")
})

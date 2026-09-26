import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { buildWorkspaceCleanupPlan, generatedWorkspaceTargets, isSafeWorkspaceCleanupTarget } from "../../lib/workspace-cleanup"

test("workspace cleanup plan includes only generated local targets", () => {
  const rootDir = path.resolve("C:/repo/learn")
  const existingPaths = [".next", ".open-next", "ops/cloudflare/.wrangler", "ops/learn-dev-3001.out.log", "output"].map((item) => path.resolve(rootDir, item))
  const plan = buildWorkspaceCleanupPlan({ existingPaths, rootDir })

  assert.deepEqual(plan.map((item) => item.relativePath), [...generatedWorkspaceTargets])
  assert.equal(plan.find((item) => item.relativePath === ".next")?.exists, true)
  assert.equal(plan.find((item) => item.relativePath === ".wrangler/tmp")?.exists, false)
  assert.equal(plan.find((item) => item.relativePath === "ops/cloudflare/.wrangler")?.exists, true)
  assert.equal(plan.find((item) => item.relativePath === "ops/learn-dev-3001.out.log")?.exists, true)
  assert.equal(plan.every((item) => item.safe), true)
})

test("workspace cleanup target safety rejects traversal and source folders", () => {
  const rootDir = path.resolve("C:/repo/learn")

  assert.equal(isSafeWorkspaceCleanupTarget(rootDir, path.resolve(rootDir, ".next")), true)
  assert.equal(isSafeWorkspaceCleanupTarget(rootDir, path.resolve(rootDir, "ops/cloudflare/.wrangler")), true)
  assert.equal(isSafeWorkspaceCleanupTarget(rootDir, path.resolve(rootDir, "ops/learn-dev-3001.out.log")), true)
  assert.equal(isSafeWorkspaceCleanupTarget(rootDir, path.resolve(rootDir, "src/app")), false)
  assert.equal(isSafeWorkspaceCleanupTarget(rootDir, path.resolve(rootDir, "../outside/.next")), false)
})

test("workspace cleanup never deletes the local database or uploads", () => {
  // `.wrangler/state` holds the local D1 database and R2 files, and the
  // Cloudflare deploy script runs this cleanup before building.
  const rootDir = path.resolve("C:/repo/learn")

  for (const kept of [".wrangler", ".wrangler/state", ".wrangler/state/v3/d1", ".wrangler/state/v3/r2"]) {
    assert.equal(isSafeWorkspaceCleanupTarget(rootDir, path.resolve(rootDir, kept)), false, kept)
  }
  assert.equal(isSafeWorkspaceCleanupTarget(rootDir, path.resolve(rootDir, ".wrangler/tmp")), true)
  assert.equal(generatedWorkspaceTargets.some((target: string) => target === ".wrangler" || target.startsWith(".wrangler/state")), false)
})

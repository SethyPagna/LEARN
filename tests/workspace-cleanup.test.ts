import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { buildWorkspaceCleanupPlan, generatedWorkspaceTargets, isSafeWorkspaceCleanupTarget } from "../lib/workspace-cleanup"

test("workspace cleanup plan includes only generated local targets", () => {
  const rootDir = path.resolve("C:/repo/learn")
  const existingPaths = [".next", ".open-next", "output"].map((item) => path.resolve(rootDir, item))
  const plan = buildWorkspaceCleanupPlan({ existingPaths, rootDir })

  assert.deepEqual(plan.map((item) => item.relativePath), [...generatedWorkspaceTargets])
  assert.equal(plan.find((item) => item.relativePath === ".next")?.exists, true)
  assert.equal(plan.find((item) => item.relativePath === ".wrangler")?.exists, false)
  assert.equal(plan.every((item) => item.safe), true)
})

test("workspace cleanup target safety rejects traversal and source folders", () => {
  const rootDir = path.resolve("C:/repo/learn")

  assert.equal(isSafeWorkspaceCleanupTarget(rootDir, path.resolve(rootDir, ".next")), true)
  assert.equal(isSafeWorkspaceCleanupTarget(rootDir, path.resolve(rootDir, "app")), false)
  assert.equal(isSafeWorkspaceCleanupTarget(rootDir, path.resolve(rootDir, "../outside/.next")), false)
})

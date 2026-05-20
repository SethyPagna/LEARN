import assert from "node:assert/strict"
import test from "node:test"
import { buildCloudflareCleanupPlan, classifyCloudflareResource, type CloudflareResourceLike } from "../lib/cloudflare-cleanup"

test("cloudflare cleanup keeps canonical LEARN resources", () => {
  const resources: CloudflareResourceLike[] = [
    { kind: "worker", name: "learn" },
    { kind: "worker", name: "learn-realtime" },
    { kind: "d1", name: "learn-db" },
    { kind: "r2", name: "learn-files" },
    { kind: "r2", name: "learn-next-cache" },
    { kind: "ai-gateway", name: "learn" },
  ]

  const plan = buildCloudflareCleanupPlan(resources)

  assert.equal(plan.length, resources.length)
  assert.equal(plan.every((item) => item.action === "keep"), true)
})

test("cloudflare cleanup protects allchess and edsync resources", () => {
  const resources: CloudflareResourceLike[] = [
    { kind: "worker", name: "allchess" },
    { kind: "worker", name: "allchess-production" },
    { kind: "pages", name: "edsync" },
    { kind: "r2", name: "assets-edsync-files" },
  ]

  const plan = buildCloudflareCleanupPlan(resources)

  assert.equal(plan.every((item) => item.action === "protected"), true)
})

test("cloudflare cleanup flags stale LEARN-owned resources for manual review", () => {
  const resources: CloudflareResourceLike[] = [
    { kind: "pages", name: "learn" },
    { kind: "worker", name: "learn-learning-os-production" },
    { kind: "r2", name: "learn-old-files" },
  ]

  const plan = buildCloudflareCleanupPlan(resources)

  assert.deepEqual(
    plan.map((item) => item.action),
    ["review-delete", "review-delete", "review-delete"],
  )
})

test("cloudflare cleanup leaves unrelated resources unknown", () => {
  const decision = classifyCloudflareResource({ kind: "worker", name: "marketing-site" })

  assert.equal(decision.action, "unknown")
})

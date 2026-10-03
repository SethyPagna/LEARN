import assert from "node:assert/strict"
import test from "node:test"
import { createLatestSaveQueue } from "../../lib/design/save-queue"

test("concurrent save requests share one drain and finish with the latest document", async () => {
  let current = "first"
  let saved = ""
  const requests: string[] = []
  const release: Array<() => void> = []
  const queue = createLatestSaveQueue({
    isDirty: () => current !== saved,
    saveOnce: async () => {
      const snapshot = current
      requests.push(snapshot)
      await new Promise<void>((resolve) => release.push(resolve))
      saved = snapshot
      return true
    },
  })
  const first = queue.flush()
  current = "newest"
  const second = queue.flush()
  assert.equal(first, second)
  assert.deepEqual(requests, ["first"], "never overlaps a request")
  release.shift()!()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(requests, ["first", "newest"])
  release.shift()!()
  assert.equal(await first, true)
  assert.equal(saved, "newest")
  await queue.flush()
  assert.equal(requests.length, 2, "a clean document is not written again")
})

test("failed saves stop the drain without dropping pending content and can be retried", async () => {
  let saved = false
  let fail = true
  let attempts = 0
  const queue = createLatestSaveQueue({ isDirty: () => !saved, saveOnce: async () => { attempts++; if (fail) return false; saved = true; return true } })
  assert.equal(await queue.flush(), false)
  assert.equal(attempts, 1)
  assert.equal(saved, false)
  fail = false
  assert.equal(await queue.flush(), true)
  assert.equal(saved, true)
  assert.equal(attempts, 2)
})

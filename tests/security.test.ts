import assert from "node:assert/strict"
import test from "node:test"
import { validateUploadFile } from "../lib/file-security"
import { checkRateLimit } from "../lib/rate-limit"

test("validateUploadFile allows regular image uploads", () => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], "note.jpg", { type: "image/jpeg" })
  assert.equal(validateUploadFile(file, new ArrayBuffer(4)), null)
})

test("validateUploadFile blocks executable signatures", () => {
  const file = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], "study.pdf", { type: "application/pdf" })
  assert.equal(validateUploadFile(file, new Uint8Array([0x4d, 0x5a, 0x90, 0x00]).buffer), "Executable files are blocked for safety.")
})

test("checkRateLimit blocks after the configured burst", async () => {
  const key = `test:${Date.now()}:${Math.random()}`
  assert.equal((await checkRateLimit({ key, limit: 2, windowMs: 60_000 })).allowed, true)
  assert.equal((await checkRateLimit({ key, limit: 2, windowMs: 60_000 })).allowed, true)
  assert.equal((await checkRateLimit({ key, limit: 2, windowMs: 60_000 })).allowed, false)
})

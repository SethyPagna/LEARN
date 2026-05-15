import assert from "node:assert/strict"
import test from "node:test"
import { classifyUploadContentType, MAX_UPLOAD_BYTES, validateUploadFile, validateUploadFileShape } from "../lib/file-security"
import { checkRateLimit } from "../lib/rate-limit"

test("validateUploadFile allows regular image uploads", () => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], "note.jpg", { type: "image/jpeg" })
  assert.equal(validateUploadFile(file, new ArrayBuffer(4)), null)
})

test("validateUploadFile blocks executable signatures", () => {
  const file = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], "study.pdf", { type: "application/pdf" })
  assert.equal(validateUploadFile(file, new Uint8Array([0x4d, 0x5a, 0x90, 0x00]).buffer), "Executable files are blocked for safety.")
})

test("upload file shape validation blocks unsafe or oversized files early", () => {
  assert.equal(validateUploadFileShape({ name: "notes.js", size: 100, type: "text/javascript" }), "This file type is blocked for safety.")
  assert.equal(validateUploadFileShape({ name: "huge.pdf", size: MAX_UPLOAD_BYTES + 1, type: "application/pdf" }), "File is too large. Keep uploads under 100 MB.")
  assert.equal(validateUploadFileShape({ name: "deck.pptx", size: 100, type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), null)
})

test("upload content types classify files for UI grouping", () => {
  assert.equal(classifyUploadContentType("image/png"), "image")
  assert.equal(classifyUploadContentType("video/mp4"), "video")
  assert.equal(classifyUploadContentType("text/csv"), "sheet")
  assert.equal(classifyUploadContentType("application/pdf"), "pdf")
})

test("checkRateLimit blocks after the configured burst", async () => {
  const key = `test:${Date.now()}:${Math.random()}`
  assert.equal((await checkRateLimit({ key, limit: 2, windowMs: 60_000 })).allowed, true)
  assert.equal((await checkRateLimit({ key, limit: 2, windowMs: 60_000 })).allowed, true)
  assert.equal((await checkRateLimit({ key, limit: 2, windowMs: 60_000 })).allowed, false)
})

import assert from "node:assert/strict"
import test from "node:test"
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from "../lib/auth"

test("hashPassword stores a non-plain password and verifies the original", async () => {
  const hash = await hashPassword("Admin123456!")

  assert.notEqual(hash, "Admin123456!")
  assert.equal(await verifyPassword("Admin123456!", hash), true)
  assert.equal(await verifyPassword("wrong-password", hash), false)
})

test("session token hashing is stable while raw tokens stay random", async () => {
  const first = createSessionToken()
  const second = createSessionToken()

  assert.notEqual(first, second)
  assert.equal(await hashSessionToken(first), await hashSessionToken(first))
  assert.notEqual(await hashSessionToken(first), await hashSessionToken(second))
})

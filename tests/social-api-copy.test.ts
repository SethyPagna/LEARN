import assert from "node:assert/strict"
import test from "node:test"
import { learningGroupApiMessages } from "../lib/social-api-copy"

test("learning group API messages stay user-facing while routes remain stable", () => {
  assert.deepEqual(Object.values(learningGroupApiMessages), [
    "Group id is required.",
    "Failed to delete group.",
    "Failed to load groups.",
    "Failed to save group.",
    "Failed to update group.",
  ])
  assert.equal(Object.values(learningGroupApiMessages).some((message) => message.includes("learning space")), false)
})

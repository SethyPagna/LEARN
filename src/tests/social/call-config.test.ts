import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import test from "node:test"
import { callIceConfiguration } from "../../lib/call-config"
import { validateStoryInput } from "../../lib/social-media"

test("TURN credentials are user-bound, expire after one hour and do not expose the shared secret", () => {
  const result = callIceConfiguration({ LEARN_TURN_URLS: "turn:relay.example.test:3478?transport=udp,https://evil.test", LEARN_TURN_SECRET: "server-secret" }, "alice", 1000000)
  assert.equal(result.relayAvailable, true)
  assert.equal(result.expiresAt, 4600)
  const relay = result.iceServers[2]
  assert.deepEqual(relay.urls, ["turn:relay.example.test:3478?transport=udp"])
  assert.equal(relay.username, "4600:alice")
  assert.equal(relay.credential, createHmac("sha1", "server-secret").update("4600:alice").digest("base64"))
  assert.ok(!JSON.stringify(result).includes("server-secret"))
  assert.notEqual(relay.credential, callIceConfiguration({ LEARN_TURN_URLS: "turn:relay.example.test", LEARN_TURN_SECRET: "server-secret" }, "bob", 1000000).iceServers[2].credential)
})

test("missing or invalid TURN configuration leaves working STUN defaults", () => {
  assert.equal(callIceConfiguration({}, "alice").relayAvailable, false)
  assert.equal(callIceConfiguration({ LEARN_TURN_URLS: "https://bad.test", LEARN_TURN_SECRET: "secret" }, "alice").iceServers.length, 2)
  assert.equal(callIceConfiguration({ LEARN_TURN_URLS: "turn:relay.test" }, "alice").relayAvailable, false)
})

test("story validation rejects missing content, unknown audiences and contradictory groups", () => {
  assert.throws(() => validateStoryInput({ audience: "friends" }), /text or a picture/)
  assert.throws(() => validateStoryInput({ body: "x", audience: "public" }), /who can see/)
  assert.throws(() => validateStoryInput({ body: "x", audience: "group" }), /Choose a group/)
  assert.throws(() => validateStoryInput({ body: "x", audience: "private", groupId: "secret" }), /Only group/)
  assert.throws(() => validateStoryInput({ body: "x".repeat(501), audience: "private" }), /500/)
})

import assert from "node:assert/strict"
import test from "node:test"
import { dmChatChannelId, groupChatChannelId, isAuthorizedForChatChannel } from "../../lib/chat-channel"

test("dmChatChannelId is stable and symmetric regardless of argument order", () => {
  const a = "user_aaaaaaaaaaaaaaaaaaaaaaaa"
  const b = "user_bbbbbbbbbbbbbbbbbbbbbbbb"
  assert.equal(dmChatChannelId(a, b), dmChatChannelId(b, a))
  assert.equal(dmChatChannelId(a, b), [a, b].sort().join("__"))
})

test("groupChatChannelId namespaces group ids distinctly from DM channels", () => {
  assert.equal(groupChatChannelId("group_1"), "group__group_1")
})

test("isAuthorizedForChatChannel only allows the two named DM participants", () => {
  const a = "user_aaaaaaaaaaaaaaaaaaaaaaaa"
  const b = "user_bbbbbbbbbbbbbbbbbbbbbbbb"
  const stranger = "user_cccccccccccccccccccccccc"
  const channel = dmChatChannelId(a, b)

  assert.equal(isAuthorizedForChatChannel(channel, a), true)
  assert.equal(isAuthorizedForChatChannel(channel, b), true)
  assert.equal(isAuthorizedForChatChannel(channel, stranger), false)
  assert.equal(isAuthorizedForChatChannel(channel, ""), false)
  assert.equal(isAuthorizedForChatChannel("", a), false)
})

test("isAuthorizedForChatChannel rejects malformed channel ids", () => {
  assert.equal(isAuthorizedForChatChannel("not-a-valid-channel-id", "user_1"), false)
  assert.equal(isAuthorizedForChatChannel("a__b__c", "user_1"), false)
})

test("isAuthorizedForChatChannel allows any authenticated user into group channels for now", () => {
  assert.equal(isAuthorizedForChatChannel(groupChatChannelId("group_1"), "user_anyone"), true)
})

import assert from "node:assert/strict"
import test from "node:test"
import { dmChatChannelId, groupChatChannelId, isAuthorizedForChatChannel, parseChatChannel } from "../../lib/chat-channel"

const alwaysMember = async () => true
const neverMember = async () => false

test("dmChatChannelId is stable and symmetric regardless of argument order", () => {
  const a = "user_aaaaaaaaaaaaaaaaaaaaaaaa"
  const b = "user_bbbbbbbbbbbbbbbbbbbbbbbb"
  assert.equal(dmChatChannelId(a, b), dmChatChannelId(b, a))
  assert.equal(dmChatChannelId(a, b), [a, b].sort().join("__"))
})

test("groupChatChannelId namespaces group ids distinctly from DM channels", () => {
  assert.equal(groupChatChannelId("group_1"), "group__group_1")
})

test("parseChatChannel recognizes DM and group channel ids, and rejects malformed ones", () => {
  const a = "user_aaaaaaaaaaaaaaaaaaaaaaaa"
  const b = "user_bbbbbbbbbbbbbbbbbbbbbbbb"
  assert.deepEqual(parseChatChannel(dmChatChannelId(a, b)), { kind: "dm", userIds: [a, b] })
  assert.deepEqual(parseChatChannel(groupChatChannelId("group_1")), { kind: "group", groupId: "group_1" })
  assert.equal(parseChatChannel(""), null)
  assert.equal(parseChatChannel("not-a-valid-channel-id"), null)
  assert.equal(parseChatChannel("a__b__c"), null)
  assert.equal(parseChatChannel("group__"), null)
})

test("isAuthorizedForChatChannel only allows the two named DM participants", async () => {
  const a = "user_aaaaaaaaaaaaaaaaaaaaaaaa"
  const b = "user_bbbbbbbbbbbbbbbbbbbbbbbb"
  const stranger = "user_cccccccccccccccccccccccc"
  const channel = dmChatChannelId(a, b)

  // A DM channel never needs a DB lookup, so this should hold even if the
  // injected membership check would otherwise say no.
  assert.equal(await isAuthorizedForChatChannel(channel, a, neverMember), true)
  assert.equal(await isAuthorizedForChatChannel(channel, b, neverMember), true)
  assert.equal(await isAuthorizedForChatChannel(channel, stranger, alwaysMember), false)
  assert.equal(await isAuthorizedForChatChannel(channel, "", alwaysMember), false)
  assert.equal(await isAuthorizedForChatChannel("", a, alwaysMember), false)
})

test("isAuthorizedForChatChannel rejects malformed channel ids", async () => {
  assert.equal(await isAuthorizedForChatChannel("not-a-valid-channel-id", "user_1", alwaysMember), false)
  assert.equal(await isAuthorizedForChatChannel("a__b__c", "user_1", alwaysMember), false)
})

test("isAuthorizedForChatChannel defers group channels to the injected membership check", async () => {
  const channel = groupChatChannelId("group_1")
  assert.equal(await isAuthorizedForChatChannel(channel, "user_member", alwaysMember), true)
  assert.equal(await isAuthorizedForChatChannel(channel, "user_outsider", neverMember), false)
})

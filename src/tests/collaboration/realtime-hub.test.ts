import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import http from "node:http"
import type { AddressInfo } from "node:net"
import test from "node:test"
import WebSocket, { WebSocketServer } from "ws"
import { LocalRealtimeHub, type HubSocket } from "../../../ops/scripts/dev/realtime-hub"
import {
  acceptClientFrame,
  clientMayEmit,
  createFrameRateLimiter,
  isAllowedRealtimeOrigin,
  shouldDeliver,
  type RealtimeIdentity,
} from "../../lib/realtime/hub-core"

class FakeSocket extends EventEmitter implements HubSocket {
  readyState = 1
  sent: string[] = []
  closed = false

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
    this.readyState = 3
    this.emit("close")
  }

  receive(frame: unknown) {
    this.emit("message", Buffer.from(typeof frame === "string" ? frame : JSON.stringify(frame)), false)
  }

  frames() {
    return this.sent.filter((line) => line.startsWith("{")).map((line) => JSON.parse(line) as Record<string, unknown>)
  }

  last(type: string) {
    return this.frames().filter((frame) => frame.type === type).at(-1)
  }
}

function identity(userId: string, kind = "chat", id = "group__g1", device?: string): RealtimeIdentity {
  return { userId, name: userId.toUpperCase(), kind, id, device, connectedAt: new Date(0).toISOString() }
}

test("the hub stamps the authenticated sender over any userId the client claims", () => {
  const hub = new LocalRealtimeHub({ heartbeatMs: 0 })
  const alice = new FakeSocket()
  const bob = new FakeSocket()
  hub.connect(alice, identity("alice"))
  hub.connect(bob, identity("bob"))

  alice.receive({ type: "typing", threadId: "group__g1", isTyping: true, userId: "bob" })

  const typing = bob.last("typing")
  assert.equal(typing?.userId, "alice", "a forged userId must be replaced with the socket's verified user")
  assert.equal(alice.last("typing"), undefined, "the sender does not get its own frame echoed")
  hub.close()
})

test("clients cannot emit server-only events, and an inbox accepts nothing from clients", () => {
  const hub = new LocalRealtimeHub({ heartbeatMs: 0 })
  const alice = new FakeSocket()
  const bob = new FakeSocket()
  hub.connect(alice, identity("alice"))
  hub.connect(bob, identity("bob"))

  alice.receive({ type: "chat-message", threadId: "t1", messageId: "m1", body: "forged" })
  alice.receive({ type: "notification", payload: { title: "forged" } })
  assert.equal(bob.last("chat-message"), undefined)
  assert.equal(bob.last("notification"), undefined)
  assert.match(String(alice.last("error")?.message), /does not accept/)

  assert.equal(clientMayEmit("inbox", "typing"), false)
  assert.equal(clientMayEmit("chat", "call-signal"), true)
  assert.equal(clientMayEmit("chat", "chat-event"), false)
  hub.close()
})

test("addressed call signals reach only the named user, and only the named device when given", () => {
  const hub = new LocalRealtimeHub({ heartbeatMs: 0 })
  const alice = new FakeSocket()
  const bobPhone = new FakeSocket()
  const bobLaptop = new FakeSocket()
  const carol = new FakeSocket()
  hub.connect(alice, identity("alice", "chat", "group__g1", "a1"))
  hub.connect(bobPhone, identity("bob", "chat", "group__g1", "phone"))
  hub.connect(bobLaptop, identity("bob", "chat", "group__g1", "laptop"))
  hub.connect(carol, identity("carol", "chat", "group__g1", "c1"))

  alice.receive({ type: "call-signal", callId: "call_1", kind: "offer", sdp: "v=0", to: "bob", toDevice: "laptop" })
  assert.equal(bobLaptop.last("call-signal")?.fromDevice, "a1")
  assert.equal(bobPhone.last("call-signal"), undefined, "another device of the addressee is skipped")
  assert.equal(carol.last("call-signal"), undefined, "other members never see the SDP")

  alice.receive({ type: "call-signal", callId: "call_1", kind: "join", to: "bob" })
  assert.equal(bobPhone.last("call-signal")?.to, "bob")
  assert.equal(carol.frames().filter((frame) => frame.type === "call-signal").length, 0)
  hub.close()
})

test("other tabs of the same user still receive a frame; only the sending socket is skipped", () => {
  const envelope = { type: "call-signal" as const, userId: "bob", payload: {}, channel: { kind: "chat", id: "x" }, receivedAt: "" }
  assert.equal(shouldDeliver(envelope, identity("bob", "chat", "x", "tab2"), false), true)
  assert.equal(shouldDeliver(envelope, identity("bob", "chat", "x", "tab1"), true), false)
})

test("presence lists who is connected and updates when a socket leaves", () => {
  const hub = new LocalRealtimeHub({ heartbeatMs: 0 })
  const alice = new FakeSocket()
  const bob = new FakeSocket()
  hub.connect(alice, identity("alice"))
  assert.deepEqual((alice.last("welcome")?.payload as { users: unknown[] }).users, [{ userId: "alice", name: "ALICE", devices: 1 }])

  hub.connect(bob, identity("bob"))
  const joined = alice.last("presence")?.payload as { count: number; users: { userId: string }[] }
  assert.equal(joined.count, 2)
  assert.deepEqual(joined.users.map((user) => user.userId).sort(), ["alice", "bob"])

  bob.close()
  const left = alice.last("presence")?.payload as { count: number; users: { userId: string }[] }
  assert.equal(left.count, 1)
  assert.deepEqual(left.users.map((user) => user.userId), ["alice"])
  hub.close()
})

test("a server broadcast can address one user, and inbox sockets define who is online", () => {
  const changes: string[] = []
  const hub = new LocalRealtimeHub({ heartbeatMs: 0, onPresenceChange: (userId, online) => changes.push(`${userId}:${online}`) })
  const aliceInbox = new FakeSocket()
  const bobInbox = new FakeSocket()
  hub.connect(aliceInbox, identity("alice", "inbox", "alice"))
  hub.connect(bobInbox, identity("bob", "inbox", "bob"))

  assert.equal(hub.broadcast("inbox", "bob", { type: "call-ring", payload: { callId: "c1" } }), 1)
  assert.deepEqual(bobInbox.last("call-ring")?.payload, { callId: "c1" })
  assert.equal(aliceInbox.last("call-ring"), undefined, "an inbox is its owner's alone")

  assert.deepEqual(hub.onlineUserIds(["alice", "bob", "carol"]), ["alice", "bob"])
  bobInbox.close()
  assert.deepEqual(hub.onlineUserIds(["alice", "bob"]), ["alice"])
  assert.deepEqual(changes, ["alice:true", "bob:true", "bob:false"])

  aliceInbox.receive({ type: "typing", threadId: "x" })
  assert.match(String(aliceInbox.last("error")?.message), /does not accept/)
  hub.close()
})

test("the app-level heartbeat is answered with pong", () => {
  const hub = new LocalRealtimeHub({ heartbeatMs: 0 })
  const alice = new FakeSocket()
  hub.connect(alice, identity("alice"))
  alice.receive("ping")
  assert.equal(alice.sent.at(-1), "pong")
  hub.close()
})

test("client frames are size-, shape- and rate-limited", () => {
  const who = identity("alice")
  assert.equal(acceptClientFrame("{not json", who).ok, false)
  assert.equal(acceptClientFrame("[1,2]", who).ok, false)
  assert.equal(acceptClientFrame(JSON.stringify({ type: "typing", threadId: "x".repeat(60_000) }), who).ok, false)
  assert.equal(acceptClientFrame(new ArrayBuffer(4), who).ok, false)

  const limiter = createFrameRateLimiter({ capacity: 3, refillPerSecond: 1 })
  assert.equal(limiter.take(1000), true)
  assert.equal(limiter.take(1000), true)
  assert.equal(limiter.take(1000), true)
  assert.equal(limiter.take(1000), false, "a burst beyond capacity is refused")
  assert.equal(limiter.take(2100), true, "tokens refill over time")
})

test("realtime origins: same host and loopback aliases pass, other sites do not", () => {
  assert.equal(isAllowedRealtimeOrigin("http://localhost:3000", "localhost:3000"), true)
  assert.equal(isAllowedRealtimeOrigin("http://127.0.0.1:3000", "localhost:3000"), true)
  assert.equal(isAllowedRealtimeOrigin("http://localhost:3000", "127.0.0.1:3000"), true)
  assert.equal(isAllowedRealtimeOrigin("https://learn.example.com", "learn.example.com"), true)
  assert.equal(isAllowedRealtimeOrigin("https://evil.example", "learn.example.com"), false)
  assert.equal(isAllowedRealtimeOrigin("http://localhost:4000", "localhost:3000"), false)
  assert.equal(isAllowedRealtimeOrigin("not a url", "localhost:3000"), false)
  assert.equal(isAllowedRealtimeOrigin(undefined, "localhost:3000"), true)
})

test("end to end over real sockets: two users exchange typing and an addressed signal", async () => {
  const hub = new LocalRealtimeHub({ heartbeatMs: 0 })
  const wss = new WebSocketServer({ noServer: true })
  const server = http.createServer()
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", "http://localhost")
    const userId = url.searchParams.get("as") || ""
    wss.handleUpgrade(request, socket, head, (ws) => hub.connect(ws, identity(userId, "chat", "alice__bob", url.searchParams.get("device") || undefined)))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo

  const open = (as: string, device: string) =>
    new Promise<{ socket: WebSocket; inbox: Record<string, unknown>[] }>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/api/realtime/chat/alice__bob?as=${as}&device=${device}`)
      const inbox: Record<string, unknown>[] = []
      socket.on("message", (data) => {
        const text = data.toString()
        if (text.startsWith("{")) inbox.push(JSON.parse(text))
      })
      socket.once("open", () => resolve({ socket, inbox }))
      socket.once("error", reject)
    })

  const alice = await open("alice", "a1")
  const bob = await open("bob", "b1")
  const waitFor = async (inbox: Record<string, unknown>[], predicate: (frame: Record<string, unknown>) => boolean) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const found = inbox.find(predicate)
      if (found) return found
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error("timed out waiting for frame")
  }

  alice.socket.send(JSON.stringify({ type: "typing", threadId: "alice__bob", isTyping: true }))
  const typing = await waitFor(bob.inbox, (frame) => frame.type === "typing")
  assert.equal(typing.userId, "alice")

  bob.socket.send(JSON.stringify({ type: "call-signal", callId: "c1", kind: "answer", sdp: "v=0 answer", to: "alice", toDevice: "a1" }))
  const answer = await waitFor(alice.inbox, (frame) => frame.type === "call-signal")
  assert.equal((answer.payload as { kind: string }).kind, "answer")
  assert.equal(answer.userId, "bob")
  assert.equal(answer.fromDevice, "b1")

  alice.socket.close()
  bob.socket.close()
  hub.close()
  wss.close()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

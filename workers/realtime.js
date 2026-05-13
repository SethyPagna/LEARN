import { DurableObject } from "cloudflare:workers"

const CHANNELS = {
  rooms: "STUDY_ROOM_DO",
  battles: "STUDY_BATTLE_DO",
  presence: "PRESENCE_DO",
}

class RealtimeLearningObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.ctx = ctx
    this.env = env
  }

  async fetch(request) {
    if (request.method === "DELETE") {
      await this.ctx.storage.deleteAll()
      this.broadcast({ type: "reset", receivedAt: new Date().toISOString() })
      return Response.json({ ok: true })
    }

    if (request.headers.get("upgrade") !== "websocket") {
      return Response.json(await this.snapshot())
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({
      connectedAt: new Date().toISOString(),
      path: new URL(request.url).pathname,
    })
    this.broadcast({ type: "presence", count: this.ctx.getWebSockets().length })
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(socket, message) {
    const payload = this.parseMessage(message)
    if (!payload) {
      socket.send(JSON.stringify({ type: "error", message: "Invalid message." }))
      return
    }

    await this.ctx.storage.put(`event:${Date.now()}:${crypto.randomUUID()}`, payload)
    this.broadcast({ ...payload, receivedAt: new Date().toISOString() })
  }

  async webSocketClose() {
    this.broadcast({ type: "presence", count: this.ctx.getWebSockets().length })
  }

  async snapshot() {
    const events = await this.ctx.storage.list({ prefix: "event:", limit: 25, reverse: true })
    return {
      connections: this.ctx.getWebSockets().length,
      events: Array.from(events.values()),
    }
  }

  broadcast(payload) {
    const message = JSON.stringify(payload)
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(message)
    }
  }

  parseMessage(message) {
    if (typeof message !== "string") return null
    try {
      const parsed = JSON.parse(message)
      if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") return null
      return parsed
    } catch {
      return null
    }
  }
}

export class StudyRoomDurableObject extends RealtimeLearningObject {}
export class StudyBattleDurableObject extends RealtimeLearningObject {}
export class PresenceDurableObject extends RealtimeLearningObject {}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const [kind, ...idParts] = url.pathname.replace(/^\/+/, "").split("/")
    const bindingName = CHANNELS[kind]
    const id = idParts.join("/")

    if (!bindingName || !id.trim()) {
      return Response.json({ error: "Unsupported realtime channel." }, { status: 404 })
    }

    const namespace = env[bindingName]
    if (!namespace) {
      return Response.json({ error: "Realtime Durable Object binding is not configured." }, { status: 503 })
    }

    const objectId = namespace.idFromName(`${kind}:${id}`)
    return namespace.get(objectId).fetch(request)
  },
}

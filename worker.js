import openNextWorker from "./.open-next/worker.js"
import { DurableObject } from "cloudflare:workers"

class RealtimeLearningObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.ctx = ctx
    this.env = env
  }

  async fetch(request) {
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

  async webSocketClose(socket, code, reason) {
    socket.close(code, reason)
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

export default openNextWorker

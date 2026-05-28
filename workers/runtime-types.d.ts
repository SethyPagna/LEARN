declare module "cloudflare:workers" {
  export class DurableObject<Env = unknown> {
    constructor(ctx: DurableObjectState, env: Env)
  }
}

interface DurableObjectNamespace {
  get(id: DurableObjectId): { fetch(request: Request): Promise<Response> }
  idFromName(name: string): DurableObjectId
}

interface DurableObjectId {}

interface DurableObjectState {
  acceptWebSocket(socket: WebSocket): void
  getWebSockets(): WebSocket[]
  storage: {
    deleteAll(): Promise<void>
    list(options?: { limit?: number; prefix?: string; reverse?: boolean }): Promise<Map<string, unknown>>
    put(key: string, value: unknown): Promise<void>
  }
}

interface ExecutionContext {
  passThroughOnException?(): void
  waitUntil(promise: Promise<unknown>): void
}

declare class WebSocketPair {
  0: WebSocket
  1: WebSocket
}

interface WebSocket {
  deserializeAttachment?(): Record<string, unknown>
  serializeAttachment?(value: Record<string, unknown>): void
}

interface ResponseInit {
  webSocket?: WebSocket
}

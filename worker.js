import { default as handler } from "./.open-next/worker.js"

const REALTIME_ROUTE = /^\/api\/realtime\/(rooms|battles|presence)\/([^/]+)$/
const WEBSOCKET_HEADERS = [
  "connection",
  "sec-websocket-accept",
  "sec-websocket-extensions",
  "sec-websocket-key",
  "sec-websocket-protocol",
  "sec-websocket-version",
  "upgrade",
]

function realtimeServiceRequest(request, kind, id) {
  const url = new URL(request.url)
  url.pathname = `/${kind}/${encodeURIComponent(id)}`
  return new Request(url, request)
}

function sessionRequest(request) {
  const url = new URL(request.url)
  url.pathname = "/api/auth/session"
  url.search = ""

  const headers = new Headers(request.headers)
  for (const header of WEBSOCKET_HEADERS) headers.delete(header)

  return new Request(url, {
    headers,
    method: "GET",
  })
}

async function isAuthenticated(request, env, ctx) {
  const response = await handler.fetch(sessionRequest(request), env, ctx)
  return response.ok
}

export default {
  async fetch(request, env, ctx) {
    if (request.headers.get("upgrade") === "websocket") {
      const match = new URL(request.url).pathname.match(REALTIME_ROUTE)
      if (!match) return new Response("Unsupported websocket route.", { status: 404 })
      if (!env.LEARN_REALTIME) return new Response("Realtime service is not configured.", { status: 503 })
      if (!(await isAuthenticated(request, env, ctx))) return new Response("Please sign in to continue.", { status: 401 })

      const [, kind, id] = match
      return env.LEARN_REALTIME.fetch(realtimeServiceRequest(request, kind, id))
    }

    return handler.fetch(request, env, ctx)
  },
}

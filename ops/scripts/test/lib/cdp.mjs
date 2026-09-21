// Minimal Chrome DevTools Protocol driver — no dependencies to install.
//
// Node 22 ships a global `WebSocket` and `fetch`, which is all this needs: the
// audit talks to an already-running Chrome over its debugging port instead of
// pulling in Puppeteer/Playwright. Passwords and page state never leave the
// machine.
//
// Point it at a different browser with `CDP_HOST=http://127.0.0.1:9223`.

const HOST = process.env.CDP_HOST || "http://127.0.0.1:9222"

export function cdpHost() {
  return HOST
}

/** The browser's version payload — doubles as the "is Chrome up?" probe. */
export async function browserVersion() {
  const res = await fetch(`${HOST}/json/version`)
  if (!res.ok) throw new Error(`${HOST}/json/version responded ${res.status}`)
  return res.json()
}

export async function listTargets() {
  const res = await fetch(`${HOST}/json/list`)
  if (!res.ok) throw new Error(`${HOST}/json/list responded ${res.status}`)
  return res.json()
}

export async function firstPageTarget() {
  const pages = (await listTargets()).filter((target) => target.type === "page")
  if (!pages.length) throw new Error("no page target — open a tab in the debugged Chrome")
  return pages[0]
}

export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error("could not open the DevTools WebSocket"))
  })

  let nextId = 0
  const pending = new Map()
  const listeners = new Set()
  const events = []

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
      return
    }
    if (message.method) {
      events.push(message)
      for (const listener of listeners) listener(message)
    }
  }

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  const waitEvent = (name, timeoutMs = 20000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(listener)
        reject(new Error(`timed out after ${timeoutMs}ms waiting for ${name}`))
      }, timeoutMs)
      const listener = (message) => {
        if (message.method !== name) return
        clearTimeout(timer)
        listeners.delete(listener)
        resolve(message.params)
      }
      listeners.add(listener)
    })

  const on = (listener) => listeners.add(listener)

  return { ws, send, waitEvent, on, events, close: () => ws.close() }
}

export async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails)
    throw new Error(`page evaluation failed: ${detail}`)
  }
  return result.result.value
}

export async function goto(cdp, url, settleMs = 2500) {
  const loaded = cdp.waitEvent("Page.loadEventFired", 30000).catch(() => null)
  await cdp.send("Page.navigate", { url })
  await loaded
  await delay(settleMs)
}

export async function shot(cdp, filePath) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" })
  const fs = await import("node:fs")
  fs.writeFileSync(filePath, Buffer.from(data, "base64"))
  return filePath
}

/** Real pointer drag through input events, so pointer capture is exercised. */
export async function drag(cdp, from, to, steps = 12) {
  const options = { button: "left", buttons: 1, clickCount: 1, pointerType: "mouse" }
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y, buttons: 0 })
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, ...options })
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: from.x + ((to.x - from.x) * step) / steps,
      y: from.y + ((to.y - from.y) * step) / steps,
      ...options,
    })
    await delay(16)
  }
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, ...options })
  await delay(400)
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

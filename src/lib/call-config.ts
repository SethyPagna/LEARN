import { createHmac } from "node:crypto"

export const DEFAULT_CALL_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }]
const TURN_CREDENTIAL_SECONDS = 3600

/** Coturn REST credentials: only an expiring HMAC reaches the signed-in browser. */
export function callIceConfiguration(env: Record<string, unknown>, userId: string, nowMs = Date.now()) {
  const urls = typeof env.LEARN_TURN_URLS === "string" ? env.LEARN_TURN_URLS.split(",").map((url) => url.trim()).filter((url) => /^turns?:[a-z0-9.-]+(?::\d{1,5})?(?:\?transport=(udp|tcp))?$/i.test(url)).slice(0, 4) : []
  const secret = typeof env.LEARN_TURN_SECRET === "string" ? env.LEARN_TURN_SECRET.trim() : ""
  const iceServers = [...DEFAULT_CALL_ICE_SERVERS]
  const expiresAt = Math.floor(nowMs / 1000) + TURN_CREDENTIAL_SECONDS
  if (urls.length && secret) {
    const username = `${expiresAt}:${userId}`
    iceServers.push({ urls, username, credential: createHmac("sha1", secret).update(username).digest("base64") })
  }
  return { iceServers, relayAvailable: Boolean(urls.length && secret), expiresAt }
}

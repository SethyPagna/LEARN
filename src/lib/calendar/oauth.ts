import { createHash, randomBytes } from "node:crypto"
import { calendarEnvironment, calendarSecretKey, readCredentials, saveCredentials } from "./connection-store"
import { calendarJson } from "./provider-http"
import type { CalendarConnection, CalendarCredentials } from "./connections-types"

export type OAuthProvider = "google" | "outlook"
export const calendarOAuthCookie = "learn_calendar_oauth"
export type CalendarOAuthState = { userId: string; provider: OAuthProvider; state: string; verifier: string; redirectUri: string; expires: number }
const providerConfig = {
  google: { prefix: "GOOGLE_CALENDAR", authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", scope: "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events" },
  outlook: { prefix: "MICROSOFT_CALENDAR", authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token", scope: "offline_access https://graph.microsoft.com/Calendars.ReadWrite" },
} as const

async function oauthConfig(provider: OAuthProvider) {
  const env = await calendarEnvironment(), spec = providerConfig[provider]
  const clientId = env[`${spec.prefix}_CLIENT_ID`], clientSecret = env[`${spec.prefix}_CLIENT_SECRET`]
  if (!clientId || !clientSecret) throw new Error(`${provider === "google" ? "Google" : "Outlook"} connection needs administrator setup.`)
  return { ...spec, clientId, clientSecret }
}

export async function connectionAvailability() {
  const env = await calendarEnvironment()
  const encryption = await calendarSecretKey().then(() => true, () => false)
  return { google: encryption && Boolean(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET), outlook: encryption && Boolean(env.MICROSOFT_CALENDAR_CLIENT_ID && env.MICROSOFT_CALENDAR_CLIENT_SECRET), apple: encryption }
}

export async function beginCalendarOAuth(userId: string, provider: OAuthProvider, origin: string) {
  const config = await oauthConfig(provider)
  const verifier = randomBytes(32).toString("base64url"), state = randomBytes(32).toString("base64url")
  const redirectUri = `${origin}/api/calendar/connections/callback`
  const url = new URL(config.authorize)
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: "code", scope: config.scope, state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", ...(provider === "google" ? { access_type: "offline", prompt: "consent" } : { prompt: "select_account" }) }).toString()
  return { url: url.href, state: { userId, provider, state, verifier, redirectUri, expires: Date.now() + 10 * 60_000 } satisfies CalendarOAuthState }
}

export async function exchangeCalendarToken(provider: OAuthProvider, fields: Record<string, string>): Promise<CalendarCredentials> {
  const config = await oauthConfig(provider)
  const result = await calendarJson<{ access_token?: string; refresh_token?: string; expires_in?: number }>(config.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...fields }) })
  if (!result.access_token) throw new Error("The calendar provider did not complete authorization.")
  return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: Date.now() + (result.expires_in || 3600) * 1000 }
}

const refreshes = new Map<string, Promise<string>>()
export async function accessToken(connection: CalendarConnection): Promise<string> {
  const credentials = await readCredentials(connection)
  if (credentials.accessToken && (credentials.expiresAt || 0) > Date.now() + 60_000) return credentials.accessToken
  const running = refreshes.get(connection.id)
  if (running) return running
  const refresh = (async () => {
    if (connection.provider === "apple" || !credentials.refreshToken) throw new Error("Reconnect this calendar account to continue.")
    const token = await exchangeCalendarToken(connection.provider, { grant_type: "refresh_token", refresh_token: credentials.refreshToken })
    await saveCredentials(connection, { ...token, refreshToken: token.refreshToken || credentials.refreshToken })
    return token.accessToken!
  })()
  refreshes.set(connection.id, refresh)
  try { return await refresh } finally { refreshes.delete(connection.id) }
}

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto"
import { query } from "@/lib/db"
import { getCloudflareBindings } from "@/lib/cloudflare"
import type { CalendarConnection, CalendarCredentials, CalendarProvider } from "./connections-types"

export async function calendarEnvironment(): Promise<Record<string, string | undefined>> {
  const bindings = await getCloudflareBindings()
  return { ...process.env, ...Object.fromEntries(Object.entries(bindings || {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")) }
}

export function sealCalendarSecret(value: unknown, secret: string, owner: string): string {
  if (secret.length < 32) throw new Error("Calendar connections need a server encryption key.")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv)
  cipher.setAAD(Buffer.from(owner))
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map(part => part.toString("base64url")).join(".")
}

export function openCalendarSecret<T>(value: string, secret: string, owner: string): T {
  const [iv, tag, data] = value.split(".").map(part => Buffer.from(part, "base64url"))
  const cipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv)
  cipher.setAAD(Buffer.from(owner)); cipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString()) as T
}

export async function calendarSecretKey() {
  const env = await calendarEnvironment()
  const key = env.CALENDAR_ENCRYPTION_KEY || env.SESSION_SECRET || ""
  if (key.length < 32 || /replace-with/i.test(key)) throw new Error("Calendar connections need a server encryption key.")
  return key
}

export async function listConnections(userId: string) {
  return (await query<CalendarConnection>("SELECT * FROM calendar_connections WHERE user_id = $1 ORDER BY created_at", [userId])).rows
}

export async function ownedConnection(userId: string, id: string) {
  const connection = (await query<CalendarConnection>("SELECT * FROM calendar_connections WHERE id = $1 AND user_id = $2", [id, userId])).rows[0]
  if (!connection) throw new Error("Calendar connection not found.")
  return connection
}

export async function readCredentials(connection: CalendarConnection) {
  return openCalendarSecret<CalendarCredentials>(connection.credentials, await calendarSecretKey(), `${connection.user_id}:${connection.id}`)
}

export async function saveCredentials(connection: CalendarConnection, credentials: CalendarCredentials) {
  const sealed = sealCalendarSecret(credentials, await calendarSecretKey(), `${connection.user_id}:${connection.id}`)
  await query("UPDATE calendar_connections SET credentials = $1, updated_at = now() WHERE id = $2 AND user_id = $3", [sealed, connection.id, connection.user_id])
}

export async function addConnection(userId: string, provider: CalendarProvider, label: string, credentials: CalendarCredentials) {
  const id = randomUUID()
  const sealed = sealCalendarSecret(credentials, await calendarSecretKey(), `${userId}:${id}`)
  await query("INSERT INTO calendar_connections (id, user_id, provider, label, credentials) VALUES ($1,$2,$3,$4,$5)", [id, userId, provider, label.slice(0, 160), sealed])
  return id
}

export async function removeConnection(userId: string, id: string) {
  await query("DELETE FROM calendar_connections WHERE id = $1 AND user_id = $2", [id, userId])
}

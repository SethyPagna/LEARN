import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { revokeSession, SESSION_COOKIE } from "@/lib/data"

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (token) await revokeSession(token)

  const response = NextResponse.json({ success: true })
  response.cookies.delete(SESSION_COOKIE)
  return response
}

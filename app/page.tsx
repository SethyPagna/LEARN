import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SESSION_COOKIE } from "@/lib/data"

export default async function HomePage() {
  const cookieStore = await cookies()
  redirect(cookieStore.get(SESSION_COOKIE)?.value ? "/dashboard" : "/login")
}

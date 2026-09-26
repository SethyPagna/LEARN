import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { SESSION_COOKIE } from "@/lib/data"
import { PublicHome } from "@/components/public-home"

export const metadata: Metadata = {
  title: "LEARN — Your ideas, in full color",
  description: "A personal studio to create, practice and make progress. Bring your notes, designs and learning together in LEARN.",
}

export default async function HomePage() {
  const cookieStore = await cookies()
  if (cookieStore.get(SESSION_COOKIE)?.value) redirect("/dashboard")
  return <PublicHome />
}

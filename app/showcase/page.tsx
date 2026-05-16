import { cookies } from "next/headers"
import { SESSION_COOKIE } from "@/lib/data"
import { LaunchShowcase } from "@/components/launch-showcase"

export default async function ShowcasePage() {
  const cookieStore = await cookies()
  const signedIn = Boolean(cookieStore.get(SESSION_COOKIE)?.value)

  return <LaunchShowcase signedIn={signedIn} />
}

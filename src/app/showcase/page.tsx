import { cookies } from "next/headers"
import { SESSION_COOKIE } from "@/lib/data"
import { LaunchShowcase } from "@/components/launch-showcase"

export const metadata = {
  title: "Explore LEARN — Find your flow",
  description: "Try a little of LEARN: create a canvas, practise an idea, plan your week and see how it all fits together.",
}

export default async function ShowcasePage() {
  const cookieStore = await cookies()
  const signedIn = Boolean(cookieStore.get(SESSION_COOKIE)?.value)

  return <LaunchShowcase signedIn={signedIn} />
}

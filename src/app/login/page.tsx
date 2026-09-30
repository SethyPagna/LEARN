import type { Metadata } from "next"
import { LoginSurface } from "@/components/login-surface"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Your next chapter starts here. Sign in to your LEARN workspace or request an invitation.",
}

export default function LoginPage() {
  return <LoginSurface />
}

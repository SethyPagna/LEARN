import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Profile" }

export default function ProfilePage() {
  return <LearnPage initialView="profile" />
}

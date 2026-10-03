import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Profile" }

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return <LearnPage initialView="profile" profileUsername={decodeURIComponent(username)} />
}

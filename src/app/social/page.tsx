import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Friends" }

export default function SocialPage() {
  return <LearnPage initialView="social" />
}

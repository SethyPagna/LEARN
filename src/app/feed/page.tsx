import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Feed" }

export default function FeedPage() {
  return <LearnPage initialView="feed" />
}

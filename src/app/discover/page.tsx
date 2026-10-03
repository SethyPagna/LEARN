import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Discover" }

export default function DiscoverPage() {
  return <LearnPage initialView="discover" />
}

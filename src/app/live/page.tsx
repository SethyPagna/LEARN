import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Live quiz" }

export default function LivePage() {
  return <LearnPage initialView="live" />
}

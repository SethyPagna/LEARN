import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "AI tutor" }

export default function AiTutorPage() {
  return <LearnPage initialView="ai" />
}

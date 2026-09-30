import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Progress" }

export default function ProgressPage() {
  return <LearnPage initialView="progress" />
}

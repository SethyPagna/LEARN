import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Practice" }

export default function PracticePage() {
  return <LearnPage initialView="practice" />
}

import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Slides" }

export default function SlidesPage() {
  return <LearnPage initialView="slides" />
}

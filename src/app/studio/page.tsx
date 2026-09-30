import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Studio" }

export default function StudioPage() {
  return <LearnPage initialView="studio" />
}

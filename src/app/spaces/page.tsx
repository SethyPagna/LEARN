import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Groups" }

export default function SpacesPage() {
  return <LearnPage initialView="spaces" />
}

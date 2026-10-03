import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Battles" }

export default function BattlesPage() {
  return <LearnPage initialView="battles" />
}

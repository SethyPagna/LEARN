import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Graph" }

export default function GraphPage() {
  return <LearnPage initialView="graph" />
}

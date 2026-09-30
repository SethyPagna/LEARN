import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Docs" }

export default function DocsPage() {
  return <LearnPage initialView="docs" />
}

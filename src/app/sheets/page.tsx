import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Sheets" }

export default function SheetsPage() {
  return <LearnPage initialView="sheets" />
}

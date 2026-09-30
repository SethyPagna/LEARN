import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Notes" }

export default function NotesPage() {
  return <LearnPage initialView="notes" />
}

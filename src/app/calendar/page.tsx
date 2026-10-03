import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Calendar" }

export default function CalendarPage() {
  return <LearnPage initialView="calendar" />
}

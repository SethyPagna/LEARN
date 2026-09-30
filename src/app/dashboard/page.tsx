import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Today" }

export default function DashboardPage() {
  return <LearnPage initialView="dashboard" />
}

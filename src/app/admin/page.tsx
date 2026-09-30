import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Admin" }

export default function AdminPage() {
  return <LearnPage initialView="admin" />
}

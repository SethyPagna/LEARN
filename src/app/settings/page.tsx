import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Settings" }

export default function SettingsPage() {
  return <LearnPage initialView="settings" />
}

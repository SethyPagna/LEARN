import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Vault" }

export default function VaultPage() {
  return <LearnPage initialView="vault" />
}

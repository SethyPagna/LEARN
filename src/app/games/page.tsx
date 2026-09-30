import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Games" }

export default function GamesPage() {
  return <LearnPage initialView="games" />
}

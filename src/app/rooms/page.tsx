import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Rooms" }

export default function RoomsPage() {
  return <LearnPage initialView="rooms" />
}

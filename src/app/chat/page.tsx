import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Chat" }

export default function ChatPage() {
  return <LearnPage initialView="chat" />
}

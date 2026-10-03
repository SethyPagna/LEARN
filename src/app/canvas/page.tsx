import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Canvas" }

export default function CanvasPage() {
  return <LearnPage initialView="canvas" />
}

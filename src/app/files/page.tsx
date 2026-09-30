import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Files" }

export default function FilesPage() {
  return <LearnPage initialView="files" />
}

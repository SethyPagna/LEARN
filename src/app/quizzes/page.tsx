import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Quizzes" }

export default function QuizzesPage() {
  return <LearnPage initialView="quizzes" />
}

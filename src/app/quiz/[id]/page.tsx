import type { Metadata } from "next"
import { LearnPage } from "@/components/learn/learn-page"

export const metadata: Metadata = { title: "Quizzes" }

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LearnPage initialView="quizzes" initialQuizId={id} />
}

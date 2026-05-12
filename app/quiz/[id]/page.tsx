import { LearnShell } from "@/components/learn/learn-shell"

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LearnShell initialView="quizzes" initialQuizId={id} />
}

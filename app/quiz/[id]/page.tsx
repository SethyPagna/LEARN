import { LearningOsShell } from "@/components/learning-os-shell"

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LearningOsShell initialView="quizzes" initialQuizId={id} />
}

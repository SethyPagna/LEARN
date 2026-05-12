import { LearningOsShell } from "@/components/learning-os-shell"

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LearningOsShell initialView="notes" initialNoteId={id} />
}

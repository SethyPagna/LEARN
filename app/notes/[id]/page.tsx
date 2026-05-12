import { LearnShell } from "@/components/learn/learn-shell"

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LearnShell initialView="notes" initialNoteId={id} />
}

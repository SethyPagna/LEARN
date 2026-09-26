import { LearnPage } from "@/components/learn/learn-page"

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LearnPage initialView="notes" initialNoteId={id} />
}

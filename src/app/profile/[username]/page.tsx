import { LearnPage } from "@/components/learn/learn-page"

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return <LearnPage initialView="profile" profileUsername={decodeURIComponent(username)} />
}

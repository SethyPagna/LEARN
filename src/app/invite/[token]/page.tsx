import { InviteAcceptanceSurface } from "@/components/invite-acceptance-surface"

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <InviteAcceptanceSurface token={token} />
}

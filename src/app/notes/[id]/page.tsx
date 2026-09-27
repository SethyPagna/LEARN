import { redirect } from "next/navigation"

/** Notes open in the Studio, which reads `?item=notes:<id>`; older links keep working. */
export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/notes?item=${encodeURIComponent(`notes:${id}`)}`)
}

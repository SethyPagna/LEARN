import { cookies } from "next/headers"
import { parseSidebarMode, SIDEBAR_COOKIE } from "@/lib/shell/sidebar-mode"
import { LearnShell } from "./learn-shell"
import type { View } from "./types"

/**
 * Server entry for every signed-in page.
 *
 * The shell is a client component, but the sidebar's width has to be right on
 * the very first paint. Reading the preference cookie here, on the server, is
 * what lets the page arrive already laid out: no flash of the wrong sidebar,
 * and no inline script to patch it before hydration.
 */
export async function LearnPage(props: {
  initialView: View
  initialNoteId?: string
  initialQuizId?: string
  profileUsername?: string
}) {
  const store = await cookies()
  return <LearnShell {...props} initialSidebarMode={parseSidebarMode(store.get(SIDEBAR_COOKIE)?.value)} />
}

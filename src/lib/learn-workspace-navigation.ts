import type { View } from "@/components/learn/types"

export type PracticeWorkspaceTab = "quizzes" | "games"
export type SocialWorkspaceTab = "chat" | "spaces" | "rooms" | "battles"

export type WorkspaceTabOption<T extends string> = {
  caption?: string
  id: T
  label: string
}

export const practiceWorkspaceTabs: Array<WorkspaceTabOption<PracticeWorkspaceTab>> = [
  { id: "quizzes", label: "Quizzes", caption: "Question banks and attempts" },
  { id: "games", label: "Games", caption: "Fast recall and playful drills" },
]

export const socialWorkspaceTabs: Array<WorkspaceTabOption<SocialWorkspaceTab>> = [
  { id: "chat", label: "Chats", caption: "Search, message, invite, and share" },
  { id: "spaces", label: "Groups", caption: "Group chats and shared study spaces" },
  { id: "rooms", label: "Calls", caption: "Voice, video, and focus rooms" },
  { id: "battles", label: "Games", caption: "Quiz battles and mini games" },
]

export function viewFromPracticeWorkspaceTab(tab: PracticeWorkspaceTab): View {
  return tab
}

export function socialWorkspaceTabFromView(view: View): SocialWorkspaceTab {
  if (view === "social") return "chat"
  if (view === "chat") return "chat"
  if (view === "spaces") return "spaces"
  if (view === "rooms") return "rooms"
  if (view === "battles") return "battles"
  return "chat"
}

export function viewFromSocialWorkspaceTab(tab: SocialWorkspaceTab): View {
  return tab
}

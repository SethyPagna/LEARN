import type { View } from "@/components/learn/types"

export type PracticeWorkspaceTab = "quizzes" | "games"
export type SocialWorkspaceTab = "home" | "chat" | "spaces" | "rooms" | "battles"
export type SocialCommandTab = "people" | "post" | "invite" | "connections"

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
  { id: "home", label: "Friends", caption: "Find and add people" },
  { id: "chat", label: "Chats", caption: "Messages" },
  { id: "spaces", label: "Groups", caption: "Study groups" },
  { id: "rooms", label: "Calls", caption: "Voice, video, and focus" },
  { id: "battles", label: "Games", caption: "Quiz games" },
]

export const socialCommandTabs: Array<WorkspaceTabOption<SocialCommandTab>> = [
  { id: "people", label: "Find" },
  { id: "post", label: "Message" },
  { id: "invite", label: "Invite" },
  { id: "connections", label: "Friends" },
]

export function viewFromPracticeWorkspaceTab(tab: PracticeWorkspaceTab): View {
  return tab
}

export function socialWorkspaceTabFromView(view: View): SocialWorkspaceTab {
  if (view === "social") return "home"
  if (view === "chat") return "chat"
  if (view === "spaces") return "spaces"
  if (view === "rooms") return "rooms"
  if (view === "battles") return "battles"
  return "home"
}

export function viewFromSocialWorkspaceTab(tab: SocialWorkspaceTab): View {
  if (tab === "home") return "social"
  return tab
}

export function getSocialCommandTab(tab: SocialCommandTab) {
  return socialCommandTabs.find((item) => item.id === tab) || socialCommandTabs[0]
}

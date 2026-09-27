"use client"

import type { User, View } from "../../types"
import type { WorkspaceOptions } from "../../preferences"
import { SocialLearningView } from "../ecosystem-views"
import { ChatView } from "../productivity-views"
import { socialWorkspaceTabFromView, socialWorkspaceTabs } from "@/lib/learn-workspace-navigation"
import styles from "./social-workspace.module.css"

export { PracticeWorkspaceView } from "./practice-workspace-view"

/**
 * Chat, Groups, Rooms and Battles. The Friends tab row above picks which one.
 * Groups, Rooms and Battles name themselves; Chat gets its title here.
 */
export function SocialWorkspaceView({ initialView, options, setView }: { initialView: View; options: WorkspaceOptions; setView: (view: View) => void; user: User | null }) {
  const tab = socialWorkspaceTabFromView(initialView)
  const title = socialWorkspaceTabs.find((item) => item.id === tab)?.label
  return <section className={`social-workspace ${styles.workspace}`}>
    {tab === "chat" ? <><h2 className="sr-only">{title}</h2><ChatView options={options} /></> : <SocialLearningView key={tab} kind={tab} setView={setView} />}
  </section>
}

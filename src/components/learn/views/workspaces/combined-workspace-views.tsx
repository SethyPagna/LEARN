"use client"

import { MessageSquare, Radio, Swords, Users, UserRound } from "lucide-react"
import type { User, View } from "../../types"
import type { WorkspaceOptions } from "../../preferences"
import { SocialLearningView } from "../ecosystem-views"
import { ChatView } from "../productivity-views"
import { socialWorkspaceTabFromView, socialWorkspaceTabs, viewFromSocialWorkspaceTab } from "@/lib/learn-workspace-navigation"
import styles from "./social-workspace.module.css"

export { PracticeWorkspaceView } from "./practice-workspace-view"

const socialIcons = { chat: MessageSquare, spaces: Users, rooms: Radio, battles: Swords }
export function SocialWorkspaceView({ initialView, options, setView, user }: { initialView: View; options: WorkspaceOptions; setView: (view: View) => void; user: User | null }) {
  const tab = socialWorkspaceTabFromView(initialView)
  return <section className={`social-workspace ${styles.workspace}`}>
    <header className={styles.header}>
      <h2 className={styles.title}>Social</h2>
      <nav aria-label="Social sections" className={styles.sections}>
        {socialWorkspaceTabs.map(item => {
          const Icon = socialIcons[item.id]
          const label = item.id === "rooms" ? "Rooms" : item.id === "battles" ? "Battles" : item.label
          return <button key={item.id} type="button" data-section={item.id} aria-current={tab === item.id ? "page" : undefined} onClick={() => setView(viewFromSocialWorkspaceTab(item.id))}>
            <Icon aria-hidden="true" /><span>{label}</span>
          </button>
        })}
      </nav>
      <button type="button" className={styles.profile} title={user?.name || "Your profile"} aria-label="Your profile" onClick={() => setView("profile")}><UserRound aria-hidden="true" /></button>
    </header>
    {tab === "chat" ? <ChatView options={options} /> : <SocialLearningView key={tab} kind={tab} setView={setView} />}
  </section>
}

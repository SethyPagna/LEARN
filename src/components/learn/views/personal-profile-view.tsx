"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { ArrowRight, Award, BookOpen, Check, ChevronDown, ChevronRight, Edit3, ExternalLink, Flame, FolderOpen, Globe, Lock, Network, Repeat2, ShieldCheck, Sparkles, Users, Zap, type LucideIcon } from "lucide-react"
import { calculateLevelFromXp } from "@/lib/learning-ecosystem"
import { buildProfileActionPlan, type ProfilePlanTarget } from "@/lib/profile-features"
import { isProfileExternalLink as safeExternalLink, normalizeProfileVisibility as normalizeVisibility, profilePreferenceString as preferenceString, profileWithSavedIdentity as profileWithIdentity, type ProfileVisibility } from "@/lib/profile-identity"
import { api } from "../api"
import { ProfileIdentityEditor, useProfileIdentityEditor } from "../profile-identity-editor"
import type { Achievement, KnowledgeNode, PublicProfile, User, View } from "../types"
import styles from "./profile-workspace.module.css"

type ProfileSection = "overview" | "shared" | "achievements"
type BadgeFilter = "all" | "earned" | "next"
const badgeIcons: Record<string, LucideIcon> = { repeat: Repeat2, network: Network, sparkles: Sparkles }
const visibilityIcons: Record<ProfileVisibility, LucideIcon> = { private: Lock, connections: Users, public: Globe }
const visibilityLabels: Record<ProfileVisibility, string> = { private: "Private", connections: "Connections", public: "Public" }
const nextActions: Record<ProfilePlanTarget, { view: View; label: string; icon: LucideIcon }> = {
  settings: { view: "settings", label: "Profile", icon: Edit3 },
  studio: { view: "studio", label: "Create", icon: ArrowRight },
  reviews: { view: "reviews", label: "Review", icon: Repeat2 },
  social: { view: "social", label: "Friends", icon: Users },
}
const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 0 })

export function OwnProfileView({ setView, user, onProfileSaved }: { setView?: (view: View) => void; user: User; onProfileSaved?: (user: User) => void }) {
  const [section, setSection] = useState<ProfileSection>("overview")
  const [badgeFilter, setBadgeFilter] = useState<BadgeFilter>("all")
  const [identity, setIdentity] = useState(user)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [profileStatus, setProfileStatus] = useState("Loading")
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [achievementStatus, setAchievementStatus] = useState("Loading")
  const [resourceRevision, setResourceRevision] = useState(0)
  const savedIdentity = useRef<User | null>(null)
  const identityRevision = useRef(0)
  const editFormId = useId()
  const editor = useProfileIdentityEditor({ user: identity, profile, onSaved: saveIdentity })
  const { editing, saveBusy, startEditing, cancelEditing } = editor

  useEffect(() => {
    setIdentity(user)
    identityRevision.current += 1
    savedIdentity.current = user
    setProfile(current => current ? profileWithIdentity(current, user) : null)
  }, [user])
  useEffect(() => {
    const controller = new AbortController()
    const requestedIdentityRevision = identityRevision.current
    setProfileStatus("Loading")
    setAchievementStatus("Loading")
    void api<{ item: PublicProfile }>(`/api/profile/public?username=${encodeURIComponent(user.username)}`, { signal: controller.signal })
      .then(({ item }) => {
        if (controller.signal.aborted) return
        setProfile(savedIdentity.current && requestedIdentityRevision !== identityRevision.current ? profileWithIdentity(item, savedIdentity.current) : item)
        setProfileStatus("Ready")
      })
      .catch(error => { if (!controller.signal.aborted) setProfileStatus(error instanceof Error ? error.message : "Unable to load profile.") })
    void api<{ items: Achievement[] }>("/api/achievements", { signal: controller.signal })
      .then(({ items }) => { if (!controller.signal.aborted) { setAchievements(items); setAchievementStatus("Ready") } })
      .catch(error => { if (!controller.signal.aborted) setAchievementStatus(error instanceof Error ? error.message : "Unable to load badges.") })
    return () => controller.abort()
  }, [user.username, resourceRevision])

  const name = profile?.name || identity.name
  const bio = profile?.bio ?? identity.bio ?? ""
  const avatarUrl = profile?.avatar_url ?? identity.avatarUrl ?? ""
  const visibility = normalizeVisibility(profile?.profile_visibility ?? identity.profileVisibility)
  const VisibilityIcon = visibilityIcons[visibility]
  const topics = profile?.artifacts ?? []
  const sharedTopics = topics.filter(topic => topic.visibility !== "private")
  const earnedBadges = achievements.filter(achievement => achievement.unlocked)
  const nextBadges = achievements.filter(achievement => !achievement.unlocked)
  const displayedBadges = badgeFilter === "earned" ? earnedBadges : badgeFilter === "next" ? nextBadges : [...earnedBadges, ...nextBadges]
  const profilePlan = buildProfileActionPlan({ profile, achievements })
  const nextAction = nextActions[profilePlan.target]
  const NextActionIcon = nextAction.icon
  const xp = profile?.metrics.xp ?? identity.metrics?.xpTotal
  const level = xp === undefined ? null : calculateLevelFromXp(xp)
  const levelProgress = level && xp !== undefined ? level.progress / (level.nextLevelXp - xp + level.progress) : 0
  const streak = profile?.metrics.streak ?? identity.metrics?.streakCurrent
  const longestStreak = profile?.metrics.longestStreak ?? identity.metrics?.streakLongest
  const mastery = topics.length ? Math.round(topics.reduce((total, topic) => total + normalizedMastery(topic.mastery), 0) / topics.length * 100) : null
  const links = [
    { label: "Intro", href: profile?.social_links?.intro || preferenceString(identity.preferences.introUrl) },
    { label: "Website", href: profile?.social_links?.website || preferenceString(identity.preferences.websiteUrl) },
    { label: "Facebook", href: profile?.social_links?.facebook || preferenceString(identity.preferences.facebookUrl) },
  ].filter(link => safeExternalLink(link.href))

  function saveIdentity(savedUser: User) {
    identityRevision.current += 1
    savedIdentity.current = savedUser
    setIdentity(savedUser)
    setProfile(current => current ? profileWithIdentity(current, savedUser) : null)
    onProfileSaved?.(savedUser)
  }

  function goTo(view: View) { setView?.(view) }

  return (
    <section className={styles.workspace} aria-label="Your profile">
      <header className={styles.hero} onKeyDown={event => { if (editing && event.key === "Escape") cancelEditing() }}>
        <div className={styles.identityRow}>
          <ProfileAvatar name={name} url={avatarUrl} className={styles.avatar} />
          <div className={styles.identity}>
            <h2>{name}</h2>
            <p>@{identity.username}</p>
            <button type="button" className={styles.visibility} onClick={startEditing} disabled={saveBusy} aria-label={`Profile visibility: ${visibilityLabels[visibility]}. Edit profile`}><VisibilityIcon aria-hidden="true" />{visibilityLabels[visibility]}</button>
          </div>
          <button ref={editor.editButton} type="button" className={styles.iconButton} aria-label="Edit profile" title="Edit profile" aria-expanded={editing} aria-controls={editFormId} onClick={() => editing ? cancelEditing() : startEditing()} disabled={saveBusy}><Edit3 aria-hidden="true" /></button>
        </div>
        {bio ? <p className={styles.bio}>{bio}</p> : !editing ? <button type="button" className={styles.addBio} onClick={startEditing}><Edit3 aria-hidden="true" />Add a little about you</button> : null}
        {links.length ? <div className={styles.links}>{links.map(link => <a key={link.label} href={link.href} target="_blank" rel="noreferrer">{link.label}<ExternalLink aria-hidden="true" /></a>)}</div> : null}
        {editing ? <ProfileIdentityEditor id={editFormId} editor={editor} /> : null}
        {!editing && editor.status ? <p className={styles.status} role="status">{editor.status}</p> : null}
      </header>

      <div className={styles.metrics}>
        <ProfileMetric icon={Zap} label="Level" value={level ? String(level.level) : "—"} detail={xp === undefined ? "XP loading" : `${numberFormat.format(xp)} XP`} progress={levelProgress} progressLabel="Progress to next level" onClick={setView ? () => goTo("progress") : undefined} tone="violet" />
        <ProfileMetric icon={Flame} label="Streak" value={streak === undefined ? "—" : String(streak)} detail={longestStreak === undefined ? "Days" : `Best ${numberFormat.format(longestStreak)} days`} onClick={setView ? () => goTo("reviews") : undefined} tone="coral" />
        <ProfileMetric icon={Network} label="Mastery" value={mastery === null ? "—" : `${mastery}%`} detail={profile ? `${topics.length} topics` : profileStatus === "Loading" ? "Topics loading" : "Unavailable"} progress={mastery === null ? undefined : mastery / 100} progressLabel="Average topic mastery" onClick={setView ? () => goTo("graph") : undefined} tone="mint" />
        <ProfileMetric icon={Award} label="Badges" value={achievementStatus === "Ready" ? String(earnedBadges.length) : "—"} detail={achievementStatus === "Ready" ? `${achievements.length} available` : achievementStatus === "Loading" ? "Loading" : "Unavailable"} progress={achievements.length ? earnedBadges.length / achievements.length : undefined} progressLabel="Badges unlocked" onClick={() => setSection("achievements")} tone="amber" />
      </div>

      <nav className={styles.sections} aria-label="Profile sections">
        <button type="button" aria-current={section === "overview" ? "page" : undefined} onClick={() => setSection("overview")}>Overview</button>
        <button type="button" aria-current={section === "shared" ? "page" : undefined} onClick={() => setSection("shared")}>Shared{profile ? <span>{sharedTopics.length}</span> : null}</button>
        <button type="button" aria-current={section === "achievements" ? "page" : undefined} onClick={() => setSection("achievements")}>Badges{achievementStatus === "Ready" ? <span>{earnedBadges.length}</span> : null}</button>
      </nav>
      {profileStatus !== "Ready" ? <ProfileResourceStatus status={profileStatus} loadingLabel="Loading profile…" onRetry={() => setResourceRevision(value => value + 1)} /> : null}

      {section === "overview" ? <div className={styles.overview}>
        <section className={styles.panel} aria-label="Your learning">
          <div className={styles.panelHeading}><h3>Learning</h3>{setView ? <button type="button" className={styles.iconButton} onClick={() => goTo("graph")} aria-label="Open knowledge graph" title="Knowledge graph"><Network aria-hidden="true" /></button> : null}</div>
          {topics.length ? <div className={styles.topicList}>{topics.slice(0, 4).map(topic => <ProfileTopic key={topic.id} topic={topic} />)}</div> : profile ? <ProfileEmpty icon={BookOpen} title="Your ideas start here" action={setView ? <button className={styles.primaryButton} onClick={() => goTo("studio")}>Create<ArrowRight aria-hidden="true" /></button> : undefined} /> : null}
          {profile ? <div className={styles.learningFooter}><span>Reputation<strong>{numberFormat.format(profile.metrics.reputation ?? 0)}</strong></span>{setView ? <button className={styles.secondaryButton} title={profilePlan.nextAction} onClick={() => goTo(nextAction.view)}><NextActionIcon aria-hidden="true" />{nextAction.label}</button> : null}</div> : null}
        </section>
        <section className={styles.panel} aria-label="Your badges">
          <div className={styles.panelHeading}><h3>Badges</h3><button className={styles.iconButton} onClick={() => setSection("achievements")} aria-label="See all badges" title="All badges"><ChevronRight aria-hidden="true" /></button></div>
          {achievements.length ? <div className={styles.badgeGrid}>{(earnedBadges.length ? earnedBadges : nextBadges).slice(0, 3).map(achievement => <ProfileBadge key={achievement.id} achievement={achievement} />)}</div> : achievementStatus === "Ready" ? <ProfileEmpty icon={Award} title="No badges yet" /> : null}
          {earnedBadges.length && nextBadges.length ? <button type="button" className={styles.nextBadge} onClick={() => { setBadgeFilter("next"); setSection("achievements") }}><Lock aria-hidden="true" /><span>{nextBadges[0].name}</span><ChevronRight aria-hidden="true" /></button> : null}
          {achievementStatus !== "Ready" ? <ProfileResourceStatus status={achievementStatus} loadingLabel="Loading badges…" onRetry={() => setResourceRevision(value => value + 1)} /> : null}
        </section>
      </div> : null}

      {section === "shared" ? <section className={styles.panel} aria-label="Shared topics">
        <div className={styles.panelHeading}><h3>Shared</h3>{setView ? <button className={styles.iconButton} onClick={() => goTo("settings")} aria-label="Manage sharing" title="Manage sharing"><ShieldCheck aria-hidden="true" /></button> : null}</div>
        {sharedTopics.length ? <div className={styles.sharedGrid}>{sharedTopics.map(topic => <ProfileTopic key={topic.id} topic={topic} expanded />)}</div> : profile ? <ProfileEmpty icon={FolderOpen} title="Nothing shared yet" action={setView ? <button className={styles.secondaryButton} onClick={() => goTo("settings")}><ShieldCheck aria-hidden="true" />Sharing</button> : undefined} /> : null}
      </section> : null}

      {section === "achievements" ? <section className={styles.panel} aria-label="Achievements">
        <div className={styles.panelHeading}><h3>Badges</h3><div className={styles.badgeFilters} aria-label="Filter badges">{(["all", "earned", "next"] as BadgeFilter[]).map(filter => <button type="button" key={filter} aria-pressed={badgeFilter === filter} onClick={() => setBadgeFilter(filter)}>{filter === "all" ? "All" : filter === "earned" ? "Earned" : "Next"}</button>)}</div></div>
        {displayedBadges.length ? <div className={styles.allBadges}>{displayedBadges.map(achievement => <ProfileBadge key={achievement.id} achievement={achievement} />)}</div> : achievementStatus === "Ready" ? <ProfileEmpty icon={Award} title={badgeFilter === "earned" ? "Your first badge is next" : badgeFilter === "next" ? "All badges unlocked" : "No badges yet"} action={setView && badgeFilter === "earned" ? <button className={styles.primaryButton} onClick={() => goTo("reviews")}><Repeat2 aria-hidden="true" />Review</button> : undefined} /> : null}
        {achievementStatus !== "Ready" ? <ProfileResourceStatus status={achievementStatus} loadingLabel="Loading badges…" onRetry={() => setResourceRevision(value => value + 1)} /> : null}
      </section> : null}
    </section>
  )
}

function ProfileAvatar({ name, url, className }: { name: string; url: string; className: string }) {
  const [failedUrl, setFailedUrl] = useState("")
  return <div className={className}>{url && failedUrl !== url ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(url)} /> : name.trim().slice(0, 1).toUpperCase() || "L"}</div>
}

function ProfileMetric({ icon: Icon, label, value, detail, progress, progressLabel, onClick, tone }: { icon: LucideIcon; label: string; value: string; detail: string; progress?: number; progressLabel?: string; onClick?: () => void; tone: string }) {
  const content = <><span className={styles.metricLabel}><Icon aria-hidden="true" />{label}</span><strong>{value}</strong><span className={styles.metricDetail}>{detail}</span>{progress !== undefined ? <progress aria-label={progressLabel} max={1} value={normalizedMastery(progress)} /> : null}</>
  return onClick ? <button type="button" className={styles.metric} data-tone={tone} onClick={onClick} aria-label={`${label}: ${value}. ${detail}`}>{content}</button> : <div className={styles.metric} data-tone={tone}>{content}</div>
}

function ProfileTopic({ topic, expanded = false }: { topic: KnowledgeNode; expanded?: boolean }) {
  const VisibilityIcon = visibilityIcons[normalizeVisibility(topic.visibility)]
  const Icon = topic.type === "note" ? BookOpen : topic.type === "flashcard" ? Repeat2 : topic.type === "resource" ? FolderOpen : topic.type === "lesson" ? Sparkles : Network
  const percent = Math.round(normalizedMastery(topic.mastery) * 100)
  return <article className={expanded ? styles.sharedTopic : styles.topic}>
    <span className={styles.topicIcon}><Icon aria-hidden="true" /></span><div className={styles.topicIdentity}><h4>{topic.title}</h4><span>{topic.type}<span title={visibilityLabels[normalizeVisibility(topic.visibility)]}><VisibilityIcon aria-hidden="true" /><span className="sr-only">{visibilityLabels[normalizeVisibility(topic.visibility)]}</span></span></span></div>
    <div className={styles.topicMastery}><span>{percent}%</span><meter min={0} max={1} value={normalizedMastery(topic.mastery)} aria-label={`${topic.title} mastery`} /></div>
    {expanded && topic.summary ? <details className={styles.topicSummary}><summary>About<ChevronDown aria-hidden="true" /></summary><p>{topic.summary}</p></details> : null}
  </article>
}

function ProfileBadge({ achievement }: { achievement: Achievement }) {
  const Icon = badgeIcons[achievement.icon] ?? Award
  return <details className={styles.badge} data-earned={Boolean(achievement.unlocked)} data-icon={achievement.icon}>
    <summary aria-label={`${achievement.name}. ${achievement.unlocked ? "Earned" : "Locked"}. ${achievement.xp_reward} XP`}><span className={styles.badgeEmblem}><Icon aria-hidden="true" />{achievement.unlocked ? <Check className={styles.badgeState} aria-hidden="true" /> : <Lock className={styles.badgeState} aria-hidden="true" />}</span><strong>{achievement.name}</strong><span>{achievement.xp_reward} XP</span><ChevronDown className={styles.badgeChevron} aria-hidden="true" /></summary>
    <p>{achievement.description}</p>
  </details>
}

function ProfileEmpty({ icon: Icon, title, action }: { icon: LucideIcon; title: string; action?: ReactNode }) {
  return <div className={styles.empty}><Icon aria-hidden="true" /><p>{title}</p>{action}</div>
}

function ProfileResourceStatus({ status, loadingLabel, onRetry }: { status: string; loadingLabel: string; onRetry: () => void }) {
  return <p role="status" className={styles.status}>{status === "Loading" ? loadingLabel : <>{status}<button type="button" className={styles.retryButton} onClick={onRetry}>Retry</button></>}</p>
}

function normalizedMastery(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0 }

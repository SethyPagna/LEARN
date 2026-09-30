"use client"

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react"
import { ArrowRight, Award, BookOpen, Camera, Check, ChevronDown, ChevronRight, Edit3, ExternalLink, Flame, FolderOpen, Globe, Lock, Network, Repeat2, ShieldCheck, Sparkles, Users, X, Zap, type LucideIcon } from "lucide-react"
import { calculateLevelFromXp } from "@/lib/learning-ecosystem"
import { buildProfileActionPlan, type ProfilePlanTarget } from "@/lib/profile-features"
import { api } from "../api"
import type { Achievement, KnowledgeNode, PublicProfile, User, View } from "../types"
import styles from "./profile-workspace.module.css"

type ProfileSection = "overview" | "shared" | "achievements"
type ProfileVisibility = "private" | "connections" | "public"
type BadgeFilter = "all" | "earned" | "next"
type ProfileDraft = {
  name: string
  bio: string
  avatarUrl: string
  visibility: ProfileVisibility
  introUrl: string
  websiteUrl: string
  facebookUrl: string
}

const MAX_AVATAR_BYTES = 256 * 1024
const MAX_BIO_LENGTH = 800
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
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ProfileDraft>(() => profileDraft(user))
  const [saveBusy, setSaveBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [saveStatus, setSaveStatus] = useState("")
  const nameInput = useRef<HTMLInputElement>(null)
  const avatarReader = useRef<FileReader | null>(null)
  const savedIdentity = useRef<User | null>(null)
  const identityRevision = useRef(0)
  const editFormId = useId()

  useEffect(() => { setIdentity(user) }, [user])
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
  useEffect(() => { if (editing) nameInput.current?.focus() }, [editing])
  useEffect(() => () => {
    const reader = avatarReader.current
    avatarReader.current = null
    reader?.abort()
  }, [])

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

  function startEditing() {
    if (editing) { nameInput.current?.focus(); return }
    setDraft(profileDraft(identity, profile))
    setSaveStatus("")
    setEditing(true)
  }

  function cancelEditing() {
    if (saveBusy) return
    avatarReader.current?.abort()
    avatarReader.current = null
    setAvatarBusy(false)
    setEditing(false)
    setSaveStatus("")
  }

  function updateDraft<K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) {
    setDraft(current => ({ ...current, [field]: value }))
  }

  function selectAvatar(file?: File) {
    if (!file) return
    if (!file.type.startsWith("image/")) { setSaveStatus("Choose an image file."); return }
    if (file.size > MAX_AVATAR_BYTES) { setSaveStatus("Use an avatar under 256 KB."); return }
    const reader = new FileReader()
    avatarReader.current = reader
    setAvatarBusy(true)
    reader.onload = () => {
      if (typeof reader.result !== "string" || avatarReader.current !== reader) return
      updateDraft("avatarUrl", reader.result)
      setSaveStatus("")
    }
    reader.onerror = () => setSaveStatus("Unable to read that image.")
    reader.onloadend = () => { if (avatarReader.current === reader) { avatarReader.current = null; setAvatarBusy(false) } }
    reader.readAsDataURL(file)
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saveBusy || avatarBusy || !draft.name.trim()) return
    if ([draft.introUrl, draft.websiteUrl, draft.facebookUrl].some(value => value.trim() && !safeExternalLink(value.trim()))) {
      setSaveStatus("Links need to start with https:// or http://.")
      event.currentTarget.querySelector("details")?.setAttribute("open", "")
      return
    }
    setSaveBusy(true)
    setSaveStatus("")
    try {
      const { user: savedUser } = await api<{ user: User }>("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: draft.name.trim(), bio: draft.bio, avatarUrl: draft.avatarUrl, profileVisibility: draft.visibility,
          preferences: { introUrl: draft.introUrl.trim(), websiteUrl: draft.websiteUrl.trim(), facebookUrl: draft.facebookUrl.trim() },
        }),
      })
      identityRevision.current += 1
      savedIdentity.current = savedUser
      setIdentity(savedUser)
      setProfile(current => current ? profileWithIdentity(current, savedUser) : null)
      onProfileSaved?.(savedUser)
      setEditing(false)
      setSaveStatus("Profile saved.")
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Unable to save profile.")
    } finally { setSaveBusy(false) }
  }

  function goTo(view: View) { setView?.(view) }

  return (
    <section className={styles.workspace} aria-label="Your profile">
      <header className={styles.hero}>
        <div className={styles.identityRow}>
          <ProfileAvatar name={name} url={avatarUrl} className={styles.avatar} />
          <div className={styles.identity}>
            <h2>{name}</h2>
            <p>@{identity.username}</p>
            <button type="button" className={styles.visibility} onClick={startEditing} disabled={saveBusy} aria-label={`Profile visibility: ${visibilityLabels[visibility]}. Edit profile`}><VisibilityIcon aria-hidden="true" />{visibilityLabels[visibility]}</button>
          </div>
          <button type="button" className={styles.iconButton} aria-label="Edit profile" title="Edit profile" aria-expanded={editing} aria-controls={editFormId} onClick={() => editing ? cancelEditing() : startEditing()} disabled={saveBusy}><Edit3 aria-hidden="true" /></button>
        </div>
        {bio ? <p className={styles.bio}>{bio}</p> : !editing ? <button type="button" className={styles.addBio} onClick={startEditing}><Edit3 aria-hidden="true" />Add a little about you</button> : null}
        {links.length ? <div className={styles.links}>{links.map(link => <a key={link.label} href={link.href} target="_blank" rel="noreferrer">{link.label}<ExternalLink aria-hidden="true" /></a>)}</div> : null}
        {editing ? <form id={editFormId} className={styles.editForm} onSubmit={event => void saveProfile(event)} onKeyDown={event => { if (event.key === "Escape") cancelEditing() }}>
          <fieldset disabled={saveBusy || avatarBusy}>
            <legend className="sr-only">Edit profile</legend>
            <div className={styles.avatarEditor}>
              <ProfileAvatar name={draft.name} url={draft.avatarUrl} className={styles.draftAvatar} />
              <label className={styles.uploadButton}><Camera aria-hidden="true" /><span>Photo</span><input type="file" accept="image/*" className="sr-only" onChange={event => { selectAvatar(event.target.files?.[0]); event.target.value = "" }} /></label>
              {draft.avatarUrl ? <button type="button" className={styles.iconButton} title="Remove photo" aria-label="Remove photo" onClick={() => updateDraft("avatarUrl", "")}><X aria-hidden="true" /></button> : null}
            </div>
            <div className={styles.fields}>
              <label><span>Name</span><input ref={nameInput} autoComplete="name" required value={draft.name} onChange={event => updateDraft("name", event.target.value)} /></label>
              <label><span>Visibility</span><select aria-label="Visibility" value={draft.visibility} onChange={event => updateDraft("visibility", normalizeVisibility(event.target.value))}><option value="private">Private</option><option value="connections">Connections</option><option value="public">Public</option></select></label>
              <label className={styles.bioField}><span>About</span><textarea rows={3} maxLength={MAX_BIO_LENGTH} value={draft.bio} onChange={event => updateDraft("bio", event.target.value)} /></label>
            </div>
            <details className={styles.linkEditor}><summary>Links<ChevronDown aria-hidden="true" /></summary><div className={styles.linkFields}>{(["introUrl", "websiteUrl", "facebookUrl"] as const).map(field => <label key={field}><span>{field === "introUrl" ? "Intro" : field === "websiteUrl" ? "Website" : "Facebook"}</span><input type="url" placeholder="https://" value={draft[field]} onInvalid={event => event.currentTarget.closest("details")?.setAttribute("open", "")} onChange={event => updateDraft(field, event.target.value)} /></label>)}</div></details>
          </fieldset>
          <div className={styles.formActions}><button type="button" className={styles.secondaryButton} disabled={saveBusy} onClick={cancelEditing}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={saveBusy || avatarBusy || !draft.name.trim()}>{saveBusy ? "Saving…" : "Save"}<Check aria-hidden="true" /></button></div>
        </form> : null}
        {saveStatus ? <p className={styles.status} role="status">{saveStatus}</p> : null}
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

function profileDraft(user: User, profile?: PublicProfile | null): ProfileDraft {
  return { name: profile?.name ?? user.name, bio: profile?.bio ?? user.bio ?? "", avatarUrl: profile?.avatar_url ?? user.avatarUrl ?? "", visibility: normalizeVisibility(profile?.profile_visibility ?? user.profileVisibility), introUrl: profile?.social_links?.intro ?? preferenceString(user.preferences.introUrl), websiteUrl: profile?.social_links?.website ?? preferenceString(user.preferences.websiteUrl), facebookUrl: profile?.social_links?.facebook ?? preferenceString(user.preferences.facebookUrl) }
}

function profileWithIdentity(profile: PublicProfile, user: User): PublicProfile {
  return { ...profile, name: user.name, bio: user.bio ?? "", avatar_url: user.avatarUrl ?? "", profile_visibility: user.profileVisibility, social_links: { intro: preferenceString(user.preferences.introUrl), website: preferenceString(user.preferences.websiteUrl), facebook: preferenceString(user.preferences.facebookUrl) } }
}

function normalizeVisibility(value: unknown): ProfileVisibility { return value === "public" || value === "connections" ? value : "private" }
function preferenceString(value: unknown): string { return typeof value === "string" ? value : "" }
function normalizedMastery(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0 }
function safeExternalLink(href: string): boolean {
  try { return ["https:", "http:"].includes(new URL(href).protocol) } catch { return false }
}

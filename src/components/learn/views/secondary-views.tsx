"use client"

import { AppearanceSettings } from "../appearance-settings"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Bot, CalendarDays, CalendarPlus, Camera, Check, ChevronRight, Clock, Copy, Download, FileText, Filter, Gauge, Languages, Link as LinkIcon, Lock, Palette, Repeat2, Save, Search, ShieldCheck, SlidersHorizontal, Sparkles, Target, Trash2, TrendingUp, UserPlus, UserRound, Users, X } from "lucide-react"
import { languageNames, supportedLocales, type SupportedLocale } from "@/lib/i18n/vocabulary"
import { buildProgressCommandPlan, summarizeLearningProgress, type ProgressActionTarget, type ProgressNextAction } from "@/lib/progress-features"
import { buildSettingsControlPlan, buildSettingsSummaryChips, normalizeSettingsNumber, summarizeSettingsOptions, type SettingsSectionGuide, type SettingsSectionId } from "@/lib/settings-features"
import { adminPanelTabOptions, buildAdminOperationalPlan, buildAdminSummaryChips, filterAdminList, summarizeAdminOperations, type AdminAccessRequest, type AdminPanelTab, type AdminSummaryChip } from "@/lib/admin-features"
import type { WorkspaceOptions } from "../preferences"
import type { AdminData, AutomationData, DashboardData, Quiz, User, View } from "../types"
import { api, formatDate } from "../api"
import { ControlButton, Panel, StatusPill as SharedStatusPill } from "../ui"
import { ProviderAdminPanel } from "./provider-admin-panel"
import { toneSurfaceClasses } from "@/lib/design-system"

const progressActionIcons: Record<ProgressActionTarget, typeof Target> = {
  ai: Sparkles,
  calendar: CalendarPlus,
  quizzes: BookOpen,
  reviews: Repeat2,
  studio: FileText,
}

const adminPanelTabIcons: Record<AdminPanelTab, typeof Gauge> = {
  overview: Gauge,
  access: UserPlus,
  users: Users,
  providers: Bot,
  audit: ShieldCheck,
  moderation: AlertTriangle,
  automation: Sparkles,
}

export function ProgressView({ dashboard, quizzes, setView }: { dashboard: DashboardData | null; quizzes: Quiz[]; setView?: (view: View) => void }) {
  const progress = useMemo(
    () => summarizeLearningProgress({ snapshot: dashboard?.snapshot, quizCount: quizzes.length }),
    [dashboard?.snapshot, quizzes.length],
  )
  const progressPlan = useMemo(() => buildProgressCommandPlan(progress), [progress])
  const ProgressPlanIcon = progressActionIcons[progressPlan.target]
  const topicSeverityCounts = useMemo(() => summarizeProgressTopicSeverity(progress.weakTopics), [progress.weakTopics])

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel className="p-4 xl:col-span-2">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-foreground">Progress command center</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <SharedStatusPill label={progress.momentumLabel} />
                <SharedStatusPill label={`${progress.focusTopics.length} focus`} />
                <SharedStatusPill label={`${progress.reviewCount} review`} />
                <SharedStatusPill label={`${topicSeverityCounts.critical} critical`} tone={topicSeverityCounts.critical ? "watch" : "neutral"} />
              </div>
            </div>
          </div>
          <button onClick={() => setView?.(progressPlan.target)} className="rounded-md border border-border bg-secondary p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground">
            <div className="flex items-center gap-3">
              <ProgressPlanIcon className="h-5 w-5 text-success" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{progressPlan.headline}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{progressPlan.chips.slice(0, 2).join(" / ")}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>
          <div className="xl:col-span-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
              <span>Goal route</span>
              <span>{progress.goalCompletion}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${Math.max(4, progress.goalCompletion)}%` }} />
            </div>
            <details className="mt-3 rounded-md border border-border bg-background">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
                <span>Route details</span>
                <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{progress.focusTopics.length || 0} focus</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </summary>
              <div className="grid gap-3 border-t border-border p-3 md:grid-cols-[1fr_auto]">
                <p className="text-sm leading-6 text-muted-foreground">{progressPlan.detail}</p>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {progressPlan.chips.map((chip) => <SharedStatusPill key={chip} label={chip} />)}
                  {progress.focusTopics.length ? progress.focusTopics.map((topic) => <SharedStatusPill key={topic} label={topic} />) : <SharedStatusPill label="No focus set" />}
                </div>
              </div>
            </details>
          </div>
        </div>
        <details className="mt-4 rounded-md border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Metrics</span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{progress.metrics.length}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </summary>
          <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 xl:grid-cols-4">
            {progress.metrics.map((metric) => (
              <div key={metric.id} className="group relative rounded-md border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-3xl font-semibold leading-none text-foreground">{metric.value}</p>
                <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-20 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{metric.detail}</p>
              </div>
            ))}
          </div>
        </details>
      </Panel>

      <Panel className="p-4">
        <ProgressHeader icon={Target} title="Next actions" info="Ranked from the current goal, weak topics, and available quiz banks." />
        <div className="mt-4 grid gap-2">
          {progress.nextActions.map((action) => (
            <ProgressActionButton key={action.id} action={action} onClick={() => setView?.(action.target)} />
          ))}
        </div>
      </Panel>

      <Panel className="p-4">
        <ProgressHeader icon={AlertTriangle} title="Weak topics" info="Lower accuracy appears first. Use these cards to decide what should become review or practice next." />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniProgressStat label="Critical" value={String(topicSeverityCounts.critical)} tone="critical" />
          <MiniProgressStat label="Watch" value={String(topicSeverityCounts.watch)} tone="watch" />
          <MiniProgressStat label="Steady" value={String(topicSeverityCounts.steady)} tone="steady" />
        </div>
        <div className="mt-4 grid gap-2">
          {progress.weakTopics.length ? progress.weakTopics.map((topic) => (
            <div key={topic.topic} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{topic.topic}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{topic.attempts || 0} attempts</p>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs font-semibold ${severityClass(topic.severity)}`}>{topic.accuracy}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${topic.severity === "critical" ? "bg-destructive" : "bg-success"}`} style={{ width: `${Math.max(6, topic.accuracy)}%` }} />
              </div>
            </div>
          )) : (
            <div className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
              No weak topics yet. Run practice to create signals.
            </div>
          )}
        </div>
      </Panel>

      <Panel className="p-4 xl:col-span-2">
        <details>
          <summary className="flex cursor-pointer items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <Gauge className="h-5 w-5" />
              </div>
              <h3 className="truncate font-semibold text-foreground">Learning loop</h3>
            </div>
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">Guide</span>
          </summary>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {[
              ["Studio", "Capture"],
              ["AI", "Clean"],
              ["Practice", "Attempt"],
              ["Reviews", "Recall"],
              ["Calendar", "Schedule"],
            ].map(([label, detail], index) => (
              <div key={label} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-secondary-foreground">{index + 1}</span>
                  {index < 4 ? <ArrowRight className="h-4 w-4 text-muted-foreground" /> : <Check className="h-4 w-4 text-success" />}
                </div>
                <p className="mt-3 font-semibold text-foreground">{label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </details>
      </Panel>
    </div>
  )
}

function ProgressActionButton({ action, onClick }: { action: ProgressNextAction; onClick: () => void }) {
  const Icon = progressActionIcons[action.target]
  return (
    <button onClick={onClick} className="group relative rounded-md border border-border bg-background p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-success" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{action.label}</p>
          <SharedStatusPill label={action.urgency} tone={urgencyTone(action.urgency)} />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-20 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{action.detail}</p>
    </button>
  )
}

function ProgressHeader({ icon: Icon, info, title }: { icon: typeof Target; info: string; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="truncate font-semibold text-foreground">{title}</h3>
      </div>
      <details className="relative">
        <summary className="flex h-8 w-8 list-none items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label={`About ${title}`}>
          <Filter className="h-4 w-4" />
        </summary>
        <p className="absolute right-0 top-10 z-20 w-64 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">{info}</p>
      </details>
    </div>
  )
}

function MiniProgressStat({ label, tone, value }: { label: string; tone: "critical" | "watch" | "steady"; value: string }) {
  return (
    <div className={`rounded-md border p-2 ${severityClass(tone)}`}>
      <p className="text-[0.65rem] font-semibold uppercase opacity-80">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-none">{value}</p>
    </div>
  )
}

function summarizeProgressTopicSeverity(topics: Array<{ severity: "critical" | "watch" | "steady" }>) {
  const counts = { critical: 0, steady: 0, watch: 0 }
  for (const topic of topics) counts[topic.severity] += 1
  return counts
}

function severityClass(severity: "critical" | "watch" | "steady") {
  if (severity === "critical") return "bg-destructive text-destructive-foreground"
  if (severity === "watch") return "bg-warning/20 text-warning-foreground"
  return "bg-success/20 text-success"
}

function urgencyTone(urgency: ProgressNextAction["urgency"]) {
  if (urgency === "high") return "critical"
  if (urgency === "medium") return "watch"
  return "steady"
}

const settingsSectionIcons: Record<SettingsSectionId, typeof Target> = {
  experience: Palette,
  learning: Target,
  privacy: Lock,
  profile: UserRound,
}

function SettingsSectionButton({
  active,
  guide,
  onClick,
  suggested,
}: {
  active: boolean
  guide: SettingsSectionGuide
  onClick: () => void
  suggested: boolean
}) {
  const Icon = settingsSectionIcons[guide.id]
  return (
    <button
      onClick={onClick}
      className={`group relative inline-flex h-10 min-w-[9.5rem] items-center gap-2 rounded-md border px-3 text-left text-sm transition hover:-translate-y-0.5 ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
      title={guide.detail}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-semibold">{guide.label}</span>
      {active ? (
        <span className="rounded-md bg-primary-foreground/15 px-2 py-0.5 text-[0.65rem] font-semibold text-primary-foreground">{suggested ? "next" : guide.badge}</span>
      ) : (
        <span className="rounded-md bg-background/80 px-2 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">{suggested ? "next" : guide.badge}</span>
      )}
      <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-[70] hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{guide.detail}</p>
    </button>
  )
}

export function SettingsView({
  user,
  automationData,
  locale,
  options,
  setLocale,
  setOptions,
}: {
  user: User | null
  automationData: AutomationData | null
  locale: SupportedLocale
  options: WorkspaceOptions
  setLocale: (locale: SupportedLocale) => void
  setOptions: (options: Partial<WorkspaceOptions>) => void
}) {
  const [name, setName] = useState(user?.name || "")
  const [email, setEmail] = useState(user?.email || "")
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "")
  const [bio, setBio] = useState(user?.bio || "")
  const [profileVisibility, setProfileVisibility] = useState(user?.profileVisibility || "private")
  const [facebookUrl, setFacebookUrl] = useState(preferenceString(user?.preferences?.facebookUrl))
  const [websiteUrl, setWebsiteUrl] = useState(preferenceString(user?.preferences?.websiteUrl))
  const [introUrl, setIntroUrl] = useState(preferenceString(user?.preferences?.introUrl))
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(Number(user?.preferences?.dailyGoalMinutes || 45))
  const [section, setSection] = useState<SettingsSectionId>("profile")
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("section") === "experience") setSection("experience")
  }, [])
  const [status, setStatus] = useState("")
  const [saveBusy, setSaveBusy] = useState(false)
  const settingsSummary = useMemo(() => summarizeSettingsOptions(options), [options])
  const settingsSummaryChips = useMemo(() => buildSettingsSummaryChips(settingsSummary), [settingsSummary])
  const primarySettingsChips = settingsSummaryChips.filter((chip) => chip.priority === "primary")
  const secondarySettingsChips = settingsSummaryChips.filter((chip) => chip.priority === "secondary")
  const settingsPlan = useMemo(() => buildSettingsControlPlan(settingsSummary), [settingsSummary])
  const profileDirty = name !== (user?.name || "")
    || email !== (user?.email || "")
    || avatarUrl !== (user?.avatarUrl || "")
    || bio !== (user?.bio || "")
    || profileVisibility !== (user?.profileVisibility || "private")
    || facebookUrl !== preferenceString(user?.preferences?.facebookUrl)
    || websiteUrl !== preferenceString(user?.preferences?.websiteUrl)
    || introUrl !== preferenceString(user?.preferences?.introUrl)
    || dailyGoalMinutes !== Number(user?.preferences?.dailyGoalMinutes || 45)

  useEffect(() => {
    setName(user?.name || "")
    setEmail(user?.email || "")
    setAvatarUrl(user?.avatarUrl || "")
    setBio(user?.bio || "")
    setProfileVisibility(user?.profileVisibility || "private")
    setFacebookUrl(preferenceString(user?.preferences?.facebookUrl))
    setWebsiteUrl(preferenceString(user?.preferences?.websiteUrl))
    setIntroUrl(preferenceString(user?.preferences?.introUrl))
    setDailyGoalMinutes(Number(user?.preferences?.dailyGoalMinutes || 45))
  }, [user?.id])

  function handleAvatarFile(file?: File | null) {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setStatus("Choose an image file for the avatar.")
      return
    }
    if (file.size > 256 * 1024) {
      setStatus("Use an avatar image under 256 KB.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setAvatarUrl(typeof reader.result === "string" ? reader.result : "")
      setStatus("Avatar draft ready. Save to apply it.")
    }
    reader.onerror = () => setStatus("Unable to read that image.")
    reader.readAsDataURL(file)
  }

  async function saveProfile() {
    if (saveBusy) return
    setSaveBusy(true)
    setStatus("Saving settings...")
    try {
      await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          name,
          email,
          avatarUrl,
          bio,
          profileVisibility,
          preferences: { dailyGoalMinutes, facebookUrl, websiteUrl, introUrl },
        }),
      })
      await api("/api/preferences", {
        method: "PUT",
        body: JSON.stringify({ dailyGoalMinutes, facebookUrl, websiteUrl, introUrl, localeReady: supportedLocales.length, workspaceOptions: options }),
      })
      setStatus("Saved profile and preferences.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save settings.")
    } finally {
      setSaveBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel className="min-w-0 p-4 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <SlidersHorizontal className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-foreground">Settings</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {primarySettingsChips.map((chip) => (
                  <SharedStatusPill key={chip.id} label={`${chip.label}: ${chip.value}`} />
                ))}
                {profileDirty ? <SharedStatusPill label="profile draft" tone="watch" /> : <SharedStatusPill label="profile saved" tone="steady" />}
              </div>
            </div>
          </div>
          <ControlButton onClick={saveProfile} active disabled={saveBusy}>
            <Save className="h-4 w-4" />
            {saveBusy ? "Saving" : "Save"}
          </ControlButton>
        </div>
        {status ? <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{status}</p> : null}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {settingsPlan.guides.map((guide) => (
            <SettingsSectionButton key={guide.id} guide={guide} active={section === guide.id} suggested={settingsPlan.suggestedSection === guide.id} onClick={() => setSection(guide.id)} />
          ))}
        </div>
        <details className="mt-3 rounded-md border border-border bg-background p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
            <span>Signals</span>
            <span className="flex items-center gap-2">
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{settingsSummary.statuses.length}</span>
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{settingsPlan.nextAction}</span>
            </span>
          </summary>
          <div className="mt-3 grid gap-2 md:grid-cols-5">
            {secondarySettingsChips.map((chip) => (
              <div key={chip.id} className="rounded-md border border-border bg-card p-2 text-sm">
                <span className="block truncate font-medium text-foreground">{chip.label}</span>
                <span className="mt-2 inline-flex"><SharedStatusPill label={chip.value} /></span>
              </div>
            ))}
            {settingsSummary.statuses.map((item) => (
              <div key={item.id} className="rounded-md border border-border bg-card p-2 text-sm">
                <span className="block truncate font-medium text-foreground">{item.label}</span>
                <span className="mt-2 inline-flex"><SharedStatusPill label={item.value} tone={settingsTone(item.tone)} /></span>
              </div>
            ))}
          </div>
          <ControlButton
            onClick={() => setSection(settingsPlan.suggestedSection)}
            className="mt-3 w-full justify-between"
          >
            <span className="min-w-0 truncate">{settingsPlan.nextAction}</span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </ControlButton>
        </details>
      </Panel>

      {section === "profile" ? (
        <Panel className="p-4">
          <SettingsSectionHeader icon={UserRound} title="Profile" body="Edit identity, avatar, privacy, and links." />
          <div className="mt-4 grid gap-4 xl:grid-cols-[280px_1fr]">
            <div className="rounded-lg bg-muted p-4">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Avatar</span>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary text-2xl font-semibold text-primary-foreground">
                  {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : (name || user?.username || "L").slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground">
                    <Camera className="h-4 w-4" />
                    Upload
                    <input type="file" accept="image/*" className="sr-only" onChange={(event) => handleAvatarFile(event.target.files?.[0])} />
                  </label>
                  {avatarUrl ? (
                    <button type="button" onClick={() => setAvatarUrl("")} className="ml-2 inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                      <X className="h-4 w-4" />
                      Clear
                    </button>
                  ) : null}
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">Small images load fastest.</p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Name" value={name} onChange={setName} />
              <Field label="Email" value={email} onChange={setEmail} />
              <SelectField label="Profile visibility" value={profileVisibility} options={["private", "connections", "public"]} onChange={setProfileVisibility} />
              <Field label="Daily goal minutes" value={String(dailyGoalMinutes)} onChange={(value) => setDailyGoalMinutes(normalizeSettingsNumber({ value, fallback: 45, min: 5, max: 240 }))} />
              <TextAreaField label="About" value={bio} onChange={(value) => setBio(value.slice(0, 800))} />
              <div className="grid gap-3">
                <Field label="Facebook" value={facebookUrl} onChange={setFacebookUrl} />
                <Field label="Website" value={websiteUrl} onChange={setWebsiteUrl} />
                <Field label="Intro link" value={introUrl} onChange={setIntroUrl} />
                <Info label="Role" value={user?.role} />
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {section === "experience" ? (
        <Panel className="p-4">
          <AppearanceSettings options={options} setOptions={setOptions} />
          <details className="mt-7 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">Editor and accessibility preferences</summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SelectField label="Files layout" value={options.fileLayout} options={["list", "grid"]} onChange={(value) => setOptions({ fileLayout: value as WorkspaceOptions["fileLayout"] })} />
            <SelectField label="Docs template" value={options.docsTemplate} options={["study", "cornell", "project"]} onChange={(value) => setOptions({ docsTemplate: value as WorkspaceOptions["docsTemplate"] })} />
            <SelectField label="Slides aspect" value={options.slidesAspect} options={["16:9", "4:3"]} onChange={(value) => setOptions({ slidesAspect: value as WorkspaceOptions["slidesAspect"] })} />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <Toggle label="High contrast" checked={options.highContrast} onChange={(checked) => setOptions({ highContrast: checked })} />
            <Toggle label="Reduced motion" checked={options.reducedMotion} onChange={(checked) => setOptions({ reducedMotion: checked })} />
            <Toggle label="Dyslexia-friendly font" checked={options.dyslexiaFriendly} onChange={(checked) => setOptions({ dyslexiaFriendly: checked })} />
            <Toggle label="File previews" checked={options.filePreview} onChange={(checked) => setOptions({ filePreview: checked })} />
          </div>
          <LanguagePicker locale={locale} setLocale={setLocale} />
          </details>
        </Panel>
      ) : null}

      {section === "learning" ? (
        <Panel className="p-4">
          <SettingsSectionHeader icon={Target} title="Learning workflow" body="Caps, defaults, reviews, and AI limits." />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <SelectField label="Quiz mode" value={options.quizMode} options={["practice", "exam", "review"]} onChange={(value) => setOptions({ quizMode: value as WorkspaceOptions["quizMode"] })} />
            <SelectField label="Game mode" value={options.gameMode} options={["sprint", "matching", "memory"]} onChange={(value) => setOptions({ gameMode: value as WorkspaceOptions["gameMode"] })} />
            <SelectField label="Rest day" value={options.restDay} options={["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]} onChange={(value) => setOptions({ restDay: value as WorkspaceOptions["restDay"] })} />
            <Field label="Calendar lead minutes" value={String(options.calendarLeadMinutes)} onChange={(value) => setOptions({ calendarLeadMinutes: normalizeSettingsNumber({ value, fallback: 15, min: 0, max: 240 }) })} />
            <Field label="Calendar block minutes" value={String(options.calendarDefaultMinutes)} onChange={(value) => setOptions({ calendarDefaultMinutes: normalizeSettingsNumber({ value, fallback: 45, min: 5, max: 240 }) })} />
            <Field label="Game question limit" value={String(options.gameQuestionLimit)} onChange={(value) => setOptions({ gameQuestionLimit: normalizeSettingsNumber({ value, fallback: 12, min: 3, max: 80 }) })} />
            <Field label="Daily review cap" value={String(options.dailyReviewCap)} onChange={(value) => setOptions({ dailyReviewCap: normalizeSettingsNumber({ value, fallback: 30, min: 1, max: 120 }) })} />
            <Field label="Feed serendipity %" value={String(options.feedSerendipity)} onChange={(value) => setOptions({ feedSerendipity: normalizeSettingsNumber({ value, fallback: 15, min: 15, max: 50 }) })} />
            <Field label="AI max tokens" value={String(options.aiMaxTokens)} onChange={(value) => setOptions({ aiMaxTokens: normalizeSettingsNumber({ value, fallback: 8192, min: 256, max: 16384 }) })} />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <Toggle label="Notes autosave" checked={options.notesAutosave} onChange={(checked) => setOptions({ notesAutosave: checked })} />
            <Toggle label="Reveal quiz answers" checked={options.revealAnswers} onChange={(checked) => setOptions({ revealAnswers: checked })} />
            <Toggle label="AI includes notes" checked={options.aiIncludeNotes} onChange={(checked) => setOptions({ aiIncludeNotes: checked })} />
          </div>
        </Panel>
      ) : null}

      {section === "privacy" ? (
        <Panel className="p-4">
          <SettingsSectionHeader icon={Lock} title="Privacy and notifications" body="Sharing, presence, reminders, and system alerts." />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SelectField label="Privacy default" value={options.privacyDefault} options={["private", "connections", "public"]} onChange={(value) => setOptions({ privacyDefault: value as WorkspaceOptions["privacyDefault"] })} />
            <Toggle label="Presence hints" checked={options.collaborationPresence} onChange={(checked) => setOptions({ collaborationPresence: checked })} />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <Toggle label="Review reminders" checked={options.notificationReviewReminders} onChange={(checked) => setOptions({ notificationReviewReminders: checked })} />
            <Toggle label="Draft warnings" checked={options.notificationDraftWarnings} onChange={(checked) => setOptions({ notificationDraftWarnings: checked })} />
            <Toggle label="Social updates" checked={options.notificationSocialUpdates} onChange={(checked) => setOptions({ notificationSocialUpdates: checked })} />
            <Toggle label="System health" checked={options.notificationSystemHealth} onChange={(checked) => setOptions({ notificationSystemHealth: checked })} />
            <Toggle label="Verbose admin" checked={options.adminVerbose} onChange={(checked) => setOptions({ adminVerbose: checked })} />
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {(automationData?.jobs || []).slice(0, 4).map((job) => (
              <div key={job.key} className="rounded-md border border-border bg-background p-3">
                <p className="text-sm font-semibold text-foreground">{job.label}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{job.description}</p>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  )
}

function SettingsSectionHeader({ body, icon: Icon, title }: { body: string; icon: typeof Target; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="truncate text-lg font-semibold text-foreground">{title}</h3>
      </div>
      <details className="relative">
        <summary className="flex h-8 w-8 list-none items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label={`About ${title}`}>
          <Filter className="h-4 w-4" />
        </summary>
        <p className="absolute right-0 top-10 z-[80] w-64 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">{body}</p>
      </details>
    </div>
  )
}

function LanguagePicker({ locale, setLocale }: { locale: SupportedLocale; setLocale: (locale: SupportedLocale) => void }) {
  return (
    <details className="mt-4 rounded-lg border border-border bg-background p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <Languages className="h-4 w-4 shrink-0 text-success" />
          <span className="truncate">Language</span>
        </span>
        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{languageNames[locale]}</span>
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {supportedLocales.map((item) => (
          <ControlButton
            key={item}
            onClick={() => setLocale(item)}
            active={locale === item}
            className="w-full justify-between"
          >
            <span>{languageNames[item]}</span>
            {locale === item ? <Check className="h-4 w-4" /> : null}
          </ControlButton>
        ))}
      </div>
    </details>
  )
}

function settingsTone(tone: "good" | "watch" | "neutral") {
  if (tone === "good") return "steady"
  if (tone === "watch") return "watch"
  return "neutral"
}

function preferenceString(value: unknown) {
  return typeof value === "string" ? value : ""
}

export function AdminView({ user, adminData, automationData, options }: { user: User | null; adminData: AdminData | null; automationData: AutomationData | null; options: WorkspaceOptions }) {
  const [tab, setTab] = useState<AdminPanelTab>("overview")
  const [query, setQuery] = useState("")
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({})
  const [inviteStatus, setInviteStatus] = useState<Record<string, string>>({})
  const adminSummary = useMemo(() => summarizeAdminOperations({ adminData, automationData }), [adminData, automationData])
  const adminPlan = useMemo(() => buildAdminOperationalPlan(adminSummary), [adminSummary])
  const adminSummaryChips = useMemo(() => buildAdminSummaryChips(adminSummary), [adminSummary])
  const primaryAdminChips = adminSummaryChips.filter((chip) => chip.priority === "primary")
  const secondaryAdminChips = adminSummaryChips.filter((chip) => chip.priority === "secondary")
  const accessRequests = useMemo(() => filterAdminList(adminSummary.accessRequests, query, ["name", "email", "goal", "role"]), [adminSummary.accessRequests, query])
  const users = useMemo(() => filterAdminList(adminData?.users || [], query, ["name", "username", "email", "role"]), [adminData?.users, query])
  const providers = useMemo(() => filterAdminList(adminData?.providers || [], query, ["name", "provider", "last_status", "last_error"]), [adminData?.providers, query])
  const audit = useMemo(() => filterAdminList(adminData?.audit || [], query, ["action", "entity", "details", "user_id"]), [adminData?.audit, query])
  const jobs = useMemo(() => filterAdminList(automationData?.jobs || [], query, ["label", "description", "key"]), [automationData?.jobs, query])
  const prompts = useMemo(() => filterAdminList(automationData?.prompts || [], query, ["label", "description", "key", "mode"]), [automationData?.prompts, query])

  if (user?.role !== "admin") return <Panel className="p-4">Admin access required.</Panel>

  async function issueInvite(request: AdminAccessRequest) {
    setInviteStatus((current) => ({ ...current, [request.id]: "Creating invite..." }))
    try {
      const response = await api<{ item: { token: string } }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ email: request.email, role: request.roleKey }),
      })
      const link = `${window.location.origin}/invite/${response.item.token}`
      setInviteLinks((current) => ({ ...current, [request.id]: link }))
      setInviteStatus((current) => ({ ...current, [request.id]: "Invite ready" }))
      await navigator.clipboard?.writeText(link).catch(() => undefined)
    } catch (error) {
      setInviteStatus((current) => ({ ...current, [request.id]: error instanceof Error ? error.message : "Unable to create invite." }))
    }
  }

  return (
    <div className="grid gap-4">
      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${toneSurfaceClasses(adminSummary.systemTone === "watch" ? "watch" : "primary")}`}>
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-foreground">Admin control center</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {primaryAdminChips.map((chip) => (
                  <AdminSummaryChipButton key={chip.id} chip={chip} onClick={() => setTab(chip.targetTab)} />
                ))}
              </div>
            </div>
          </div>
          <label className="flex h-10 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-primary/25">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search admin data" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
          </label>
        </div>
        <details className="mt-5 rounded-md border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Admin signals</span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{secondaryAdminChips.length} more</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </summary>
          <div className="grid gap-3 border-t border-border p-3 md:grid-cols-3 xl:grid-cols-6">
            {secondaryAdminChips.map((chip) => (
              <AdminSummaryChipButton key={chip.id} chip={chip} onClick={() => setTab(chip.targetTab)} relaxed />
            ))}
          </div>
        </details>
        <button onClick={() => setTab(adminPlan.targetTab)} className="mt-4 flex w-full items-center justify-between gap-3 rounded-md border border-border bg-secondary p-3 text-left transition hover:bg-accent hover:text-accent-foreground">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{adminPlan.headline}</span>
            <span className="mt-1 flex flex-wrap gap-2">
              {adminPlan.chips.map((chip) => <SharedStatusPill key={chip} label={chip} />)}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            {adminPlan.nextAction}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </button>
        <div className="mt-4 flex flex-wrap gap-2">
          {adminPanelTabOptions.map(({ id, label }) => {
            const Icon = adminPanelTabIcons[id]
            return (
            <ControlButton
              key={id}
              onClick={() => setTab(id)}
              active={tab === id}
              size="compact"
            >
              <Icon className="h-4 w-4" />
              {label}
            </ControlButton>
            )
          })}
        </div>
      </Panel>

      {tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <AdminList title="Provider attention" items={adminSummary.providerIssues} emptyLabel="No provider issues." accent={adminSummary.providerIssues.length ? "watch" : "good"} />
          <AdminList title="Recent audit" items={adminSummary.recentAudit} emptyLabel="No audit rows yet." accent={adminSummary.recentAudit.length ? "neutral" : "watch"} />
          <AdminList title="Automation jobs" items={adminSummary.visibleAutomation} emptyLabel="No automation jobs loaded." accent={adminSummary.visibleAutomation.length ? "good" : "neutral"} />
        </div>
      ) : null}
      {tab === "access" ? (
        <AdminAccessRequests
          inviteLinks={inviteLinks}
          inviteStatus={inviteStatus}
          items={accessRequests}
          onIssueInvite={issueInvite}
          query={query}
        />
      ) : null}
      {tab === "users" ? <AdminList title="Users" items={users} emptyLabel="No users match this search." query={query} /> : null}
      {tab === "providers" ? (
        <div className="grid gap-4">
          <AdminList title="Provider records" items={providers} emptyLabel="No provider records match this search." query={query} accent={adminPlan.riskCount ? "watch" : "good"} />
          <ProviderAdminPanel />
        </div>
      ) : null}
      {tab === "audit" ? <AdminList title="Audit" items={audit} emptyLabel="No audit rows match this search." query={query} /> : null}
      {tab === "moderation" ? <AdminModerationQueue query={query} /> : null}
      {tab === "automation" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <AdminList title="Automation jobs" items={jobs} emptyLabel="No automation jobs match this search." query={query} accent={jobs.length ? "good" : "neutral"} />
          <AdminList title="AI prompt contracts" items={prompts} emptyLabel="No prompt contracts match this search." query={query} accent={prompts.length ? "good" : "neutral"} />
        </div>
      ) : null}

      {options.adminVerbose ? (
        <Panel className="p-4">
          <p className="font-semibold text-foreground">Current option policy</p>
          <pre className="mt-3 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">{JSON.stringify(options, null, 2)}</pre>
        </Panel>
      ) : null}
    </div>
  )
}

function AdminSummaryChipButton({ chip, onClick, relaxed = false }: { chip: AdminSummaryChip; onClick: () => void; relaxed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-md border px-3 py-2 text-left transition hover:-translate-y-0.5 ${adminSummaryChipClasses(chip.tone)} ${relaxed ? "min-h-20" : ""}`}
      title={`${chip.label}: ${chip.value}`}
    >
      <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.12em] opacity-75">{chip.label}</span>
      <span className="mt-1 block text-sm font-semibold">{chip.value}</span>
    </button>
  )
}

function adminSummaryChipClasses(tone: AdminSummaryChip["tone"]) {
  if (tone === "good") return "border-success/30 bg-success/10 text-success hover:bg-success/15"
  if (tone === "watch") return "border-warning/35 bg-warning/10 text-warning hover:bg-warning/15"
  return "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-lg bg-muted p-4">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none" />
    </label>
  )
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-lg bg-muted p-4">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={7} className="mt-2 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none" />
    </label>
  )
}

function Info({ label, value }: { label: string; value?: unknown }) {
  return (
    <div className="rounded-lg bg-muted p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 font-medium text-foreground">{String(value ?? "Not set")}</p>
    </div>
  )
}

function CompactInfo({ label, tone = "neutral", value }: { label: string; tone?: string; value: string }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${compactInfoToneClass(tone)}`}>
      <p className="text-[0.65rem] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}

function compactInfoToneClass(tone: string) {
  if (tone === "primary") return "border-primary/25 bg-primary/10"
  if (tone === "sky") return "border-sky-400/25 bg-sky-500/10"
  if (tone === "success") return "border-success/25 bg-success/10"
  if (tone === "warning") return "border-warning/25 bg-warning/10"
  return "border-border bg-background"
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-lg bg-muted p-4">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3 text-sm text-foreground">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

interface AdminListItem {
  id?: string
  key?: string
  name?: string
  username?: string
  action?: string
  provider?: string
  label?: string
  email?: string
  role?: string
  entity?: string
  description?: string
  default_model?: string
  details?: Record<string, unknown> | string
  provider_type?: string
  last_status?: string
  enabled?: boolean
  has_key?: boolean
}

function AdminList<TItem extends AdminListItem>({
  accent = "neutral",
  emptyLabel = "No records yet.",
  items,
  query = "",
  title,
}: {
  accent?: "good" | "watch" | "neutral"
  emptyLabel?: string
  items: TItem[]
  query?: string
  title: string
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{title}</p>
          {query ? <p className="mt-1 text-xs text-muted-foreground">Filtered by "{query}"</p> : null}
        </div>
        <SharedStatusPill label={String(items.length)} tone={settingsTone(accent)} />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {items.slice(0, 12).map((item, index) => (
          <div key={item.id || item.key || index} className="rounded-md border border-border bg-background p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold text-foreground">{item.name || item.username || item.action || item.provider || item.label || item.id || item.key || "Record"}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{String(item.email || item.role || item.entity || item.description || item.default_model || item.details || item.provider_type || item.key || "No detail")}</p>
            {item.last_status || item.enabled !== undefined || item.has_key !== undefined ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.last_status ? <SharedStatusPill label={item.last_status} /> : null}
                {item.enabled !== undefined ? <SharedStatusPill label={item.enabled ? "enabled" : "off"} tone={item.enabled ? "steady" : "neutral"} /> : null}
                {item.has_key !== undefined ? <SharedStatusPill label={item.has_key ? "key stored" : "key missing"} tone={item.has_key ? "steady" : "watch"} /> : null}
              </div>
            ) : null}
          </div>
        ))}
        {!items.length ? <p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground md:col-span-2 xl:col-span-4">{emptyLabel}</p> : null}
      </div>
    </Panel>
  )
}

function AdminAccessRequests({
  inviteLinks,
  inviteStatus,
  items,
  onIssueInvite,
  query,
}: {
  inviteLinks: Record<string, string>
  inviteStatus: Record<string, string>
  items: AdminAccessRequest[]
  onIssueInvite: (request: AdminAccessRequest) => void
  query: string
}) {
  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Access requests</p>
          <p className="mt-1 text-sm text-muted-foreground">Review request-access audit rows and issue invite links without digging through raw logs.</p>
          {query ? <p className="mt-1 text-xs text-muted-foreground">Filtered by "{query}"</p> : null}
        </div>
        <SharedStatusPill label={String(items.length)} tone={items.length ? "watch" : "steady"} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-md border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{item.email}</p>
              </div>
              <SharedStatusPill label={item.role} />
            </div>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{item.goal || "No learning goal included."}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ControlButton
                type="button"
                onClick={() => onIssueInvite(item)}
                active
                size="compact"
              >
                <UserPlus className="h-4 w-4" />
                Issue invite
              </ControlButton>
              {inviteLinks[item.id] ? (
                <ControlButton
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(inviteLinks[item.id]).catch(() => undefined)}
                  size="compact"
                  className="min-w-0 max-w-full"
                  title={inviteLinks[item.id]}
                >
                  <LinkIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">Copy invite link</span>
                </ControlButton>
              ) : null}
              {inviteStatus[item.id] ? <SharedStatusPill label={inviteStatus[item.id]} tone={inviteStatus[item.id].toLowerCase().includes("ready") ? "steady" : "neutral"} /> : null}
            </div>
          </article>
        ))}
        {!items.length ? (
          <p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground lg:col-span-2">
            No pending access requests match this search. New request-access submissions appear here after learners submit the login form.
          </p>
        ) : null}
      </div>
    </Panel>
  )
}

interface AdminModerationItem {
  id: string
  reporter_user_id?: string
  target_type?: string
  target_id?: string
  reason?: string
  status?: string
  notes?: string
  created_at?: string
}

const closedModerationStatuses = new Set(["resolved", "dismissed"])

function AdminModerationQueue({ query }: { query: string }) {
  const [items, setItems] = useState<AdminModerationItem[]>([])
  const [status, setStatus] = useState("Loading moderation queue...")
  const [pendingId, setPendingId] = useState("")
  const visibleItems = filterAdminList(items, query, ["reason", "target_type", "target_id", "status", "notes"])

  async function refresh() {
    try {
      const response = await api<{ items: AdminModerationItem[] }>("/api/moderation")
      setItems(response.items)
      setStatus(response.items.length ? "" : "Nothing is waiting for moderation.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load the moderation queue.")
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function decide(item: AdminModerationItem, nextStatus: "resolved" | "dismissed") {
    setPendingId(item.id)
    setStatus(`Marking ${item.id} ${nextStatus}...`)
    try {
      await api("/api/moderation", {
        method: "POST",
        body: JSON.stringify({
          id: item.id,
          targetType: item.target_type,
          targetId: item.target_id,
          reason: item.reason,
          notes: item.notes,
          status: nextStatus,
        }),
      })
      await refresh()
      setStatus(`Marked ${item.id} ${nextStatus}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update the moderation item.")
    } finally {
      setPendingId("")
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Moderation queue</p>
          <p className="mt-1 text-sm text-muted-foreground">Review flagged content and close it out without leaving the admin panel.</p>
          {query ? <p className="mt-1 text-xs text-muted-foreground">Filtered by "{query}"</p> : null}
        </div>
        <SharedStatusPill label={String(visibleItems.length)} tone={visibleItems.length ? "watch" : "steady"} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {visibleItems.map((item) => (
          <article key={item.id} className="rounded-md border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{item.reason || "Needs review"}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {item.target_type || "feed"} - {item.target_id || "unknown target"}
                </p>
              </div>
              <SharedStatusPill label={item.status || "open"} tone={closedModerationStatuses.has(item.status || "") ? "steady" : "watch"} />
            </div>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{item.notes || "No reviewer notes yet."}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Reported by {item.reporter_user_id || "unknown"} {item.created_at ? `| ${formatDate(item.created_at)}` : ""}
            </p>
            {closedModerationStatuses.has(item.status || "") ? null : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <ControlButton type="button" onClick={() => decide(item, "resolved")} active size="compact" disabled={pendingId === item.id}>
                  <Check className="h-4 w-4" />
                  Resolve
                </ControlButton>
                <ControlButton type="button" onClick={() => decide(item, "dismissed")} size="compact" disabled={pendingId === item.id}>
                  <X className="h-4 w-4" />
                  Dismiss
                </ControlButton>
              </div>
            )}
          </article>
        ))}
        {!visibleItems.length ? (
          <p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground lg:col-span-2">
            {status || "No moderation items match this search."}
          </p>
        ) : null}
      </div>
      {visibleItems.length && status ? <p className="mt-3 text-sm text-muted-foreground">{status}</p> : null}
    </Panel>
  )
}

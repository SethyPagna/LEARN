export interface ProfileArtifactLike {
  visibility?: "private" | "connections" | "public" | string
  mastery?: number
}

export interface ProfileLike {
  bio?: string | null
  metrics?: Record<string, number>
  artifacts?: ProfileArtifactLike[]
}

export interface ProfileAchievementLike {
  unlocked?: boolean
}

export type ProfilePlanTarget = "settings" | "studio" | "reviews" | "social"

export interface ProfilePlanStat {
  id: string
  label: string
  value: string
  tone: "good" | "watch" | "neutral"
}

export interface ProfileSummaryChip extends ProfilePlanStat {
  priority: "primary" | "secondary"
  target: ProfilePlanTarget
}

export interface ProfileActionPlan {
  headline: string
  nextAction: string
  target: ProfilePlanTarget
  privacyLabel: string
  masteryLabel: string
  stats: ProfilePlanStat[]
}

export function buildProfileSummaryChips(plan: ProfileActionPlan): ProfileSummaryChip[] {
  const statsById = new Map(plan.stats.map((stat) => [stat.id, stat]))
  const streak = statsById.get("streak")
  const xp = statsById.get("xp")
  const artifacts = statsById.get("artifacts")
  const achievements = statsById.get("achievements")

  return [
    {
      id: "next",
      label: "Next",
      value: profileShortActionLabel(plan.target),
      tone: plan.target === "settings" ? "watch" : "good",
      priority: "primary",
      target: plan.target,
    },
    {
      id: "privacy",
      label: "Privacy",
      value: plan.privacyLabel,
      tone: plan.privacyLabel === "Nothing shared" ? "neutral" : "good",
      priority: "primary",
      target: "settings",
    },
    {
      id: "mastery",
      label: "Mastery",
      value: plan.masteryLabel.replace(" average mastery", ""),
      tone: plan.masteryLabel.startsWith("No ") ? "watch" : "good",
      priority: "primary",
      target: "reviews",
    },
    {
      id: "streak",
      label: streak?.label ?? "Streak",
      value: streak?.value ?? "0",
      tone: streak?.tone ?? "neutral",
      priority: streak?.tone === "good" ? "primary" : "secondary",
      target: "reviews",
    },
    {
      id: "xp",
      label: xp?.label ?? "XP",
      value: xp?.value ?? "0",
      tone: xp?.tone ?? "neutral",
      priority: "secondary",
      target: "reviews",
    },
    {
      id: "artifacts",
      label: artifacts?.label ?? "Artifacts",
      value: artifacts?.value ?? "0",
      tone: artifacts?.tone ?? "neutral",
      priority: artifacts?.tone === "watch" ? "primary" : "secondary",
      target: "studio",
    },
    {
      id: "achievements",
      label: achievements?.label ?? "Badges",
      value: achievements?.value ?? "0",
      tone: achievements?.tone ?? "neutral",
      priority: "secondary",
      target: "reviews",
    },
  ]
}

export function buildProfileActionPlan(input: {
  profile?: ProfileLike | null
  achievements?: ProfileAchievementLike[]
}): ProfileActionPlan {
  const profile = input.profile
  const artifacts = profile?.artifacts ?? []
  const metrics = profile?.metrics ?? {}
  const publicCount = artifacts.filter((artifact) => artifact.visibility === "public").length
  const sharedCount = artifacts.filter((artifact) => artifact.visibility === "connections").length
  const privateCount = artifacts.filter((artifact) => artifact.visibility === "private").length
  const unlockedAchievements = (input.achievements ?? []).filter((achievement) => achievement.unlocked).length
  const totalAchievements = input.achievements?.length ?? 0
  const averageMastery = averageArtifactMastery(artifacts)
  const hasBio = Boolean(profile?.bio?.trim())

  const target = chooseProfileTarget({
    artifactCount: artifacts.length,
    hasBio,
    publicCount,
    sharedCount,
    totalAchievements,
    unlockedAchievements,
  })

  return {
    headline: profileHeadline(target),
    nextAction: profileActionLabel(target),
    target,
    privacyLabel: labelProfilePrivacy({ privateCount, publicCount, sharedCount }),
    masteryLabel: artifacts.length ? `${averageMastery}% average mastery` : "No public artifacts",
    stats: [
      {
        id: "streak",
        label: "Streak",
        value: String(Math.max(0, metrics.streak ?? 0)),
        tone: (metrics.streak ?? 0) > 0 ? "good" : "neutral",
      },
      {
        id: "xp",
        label: "XP",
        value: String(Math.max(0, metrics.xp ?? 0)),
        tone: (metrics.xp ?? 0) > 0 ? "good" : "neutral",
      },
      {
        id: "artifacts",
        label: "Artifacts",
        value: String(artifacts.length),
        tone: artifacts.length > 0 ? "good" : "watch",
      },
      {
        id: "achievements",
        label: "Badges",
        value: totalAchievements ? `${unlockedAchievements}/${totalAchievements}` : "0",
        tone: unlockedAchievements > 0 ? "good" : "neutral",
      },
    ],
  }
}

function chooseProfileTarget(input: {
  artifactCount: number
  hasBio: boolean
  publicCount: number
  sharedCount: number
  totalAchievements: number
  unlockedAchievements: number
}): ProfilePlanTarget {
  if (!input.hasBio) return "settings"
  if (input.artifactCount === 0) return "studio"
  if (input.publicCount + input.sharedCount === 0) return "settings"
  if (input.totalAchievements > 0 && input.unlockedAchievements < input.totalAchievements) return "reviews"
  return "social"
}

function profileHeadline(target: ProfilePlanTarget) {
  if (target === "settings") return "Tune your learner portrait"
  if (target === "studio") return "Create a first shareable artifact"
  if (target === "reviews") return "Unlock the next achievement"
  return "Share learning with intention"
}

function profileActionLabel(target: ProfilePlanTarget) {
  if (target === "settings") return "Open profile settings"
  if (target === "studio") return "Create in Studio"
  if (target === "reviews") return "Review due cards"
  return "Open social groups"
}

function profileShortActionLabel(target: ProfilePlanTarget) {
  if (target === "settings") return "Profile"
  if (target === "studio") return "Create"
  if (target === "reviews") return "Review"
  return "Share"
}

function labelProfilePrivacy(input: { privateCount: number; publicCount: number; sharedCount: number }) {
  if (input.publicCount > 0) return `${input.publicCount} public`
  if (input.sharedCount > 0) return `${input.sharedCount} shared`
  if (input.privateCount > 0) return "Private by default"
  return "Nothing shared"
}

function averageArtifactMastery(artifacts: ProfileArtifactLike[]) {
  if (!artifacts.length) return 0
  let total = 0
  for (const artifact of artifacts) {
    total += Math.max(0, Math.min(1, artifact.mastery ?? 0))
  }
  return Math.round((total / artifacts.length) * 100)
}

export type AccessRequestInput = {
  email?: unknown
  goal?: unknown
  name?: unknown
  role?: unknown
}

export type AccessRequestValidation =
  | {
      ok: true
      value: {
        email: string
        goal: string
        name: string
        role: string
      }
    }
  | {
      error: string
      ok: false
    }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLE_LABELS = new Map([
  ["learner", "Learner"],
  ["teacher", "Teacher"],
  ["team", "Team lead"],
  ["creator", "Creator"],
])

export function normalizeAccessRequest(input: AccessRequestInput): AccessRequestValidation {
  const name = String(input.name || "").trim().replace(/\s+/g, " ").slice(0, 120)
  const email = String(input.email || "").trim().toLowerCase().slice(0, 254)
  const goal = String(input.goal || "").trim().replace(/\s+/g, " ").slice(0, 600)
  const roleKey = String(input.role || "learner").trim().toLowerCase()
  const role = ROLE_LABELS.get(roleKey) || ROLE_LABELS.get("learner")!

  if (name.length < 2) return { ok: false, error: "Enter your name." }
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: "Enter a valid email address." }
  if (goal.length < 12) return { ok: false, error: "Tell us what you want to learn or build." }

  return { ok: true, value: { email, goal, name, role } }
}

export function buildAuthEntryPlan(input: {
  accessRequestStatus?: "idle" | "loading" | "success" | "error"
  identifier?: string
  mode: "request" | "signin"
  password?: string
}) {
  if (input.mode === "request") {
    if (input.accessRequestStatus === "success") {
      return {
        label: "Request saved",
        nextAction: "An admin can review it from audit activity.",
        tone: "good" as const,
      }
    }

    return {
      label: "Request access",
      nextAction: "Share your email and learning goal.",
      tone: "neutral" as const,
    }
  }

  const hasIdentifier = Boolean(input.identifier?.trim())
  const hasPassword = Boolean(input.password)
  return {
    label: hasIdentifier && hasPassword ? "Ready to sign in" : "Credentials needed",
    nextAction: hasIdentifier && hasPassword ? "Open your workspace." : "Use your account or fill a demo account.",
    tone: hasIdentifier && hasPassword ? "good" as const : "watch" as const,
  }
}

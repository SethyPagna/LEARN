export type AccessRequestInput = {
  email?: unknown
  goal?: unknown
  name?: unknown
  role?: unknown
}

export type InviteAcceptanceInput = {
  email?: unknown
  name?: unknown
  password?: unknown
  token?: unknown
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

export type InviteAcceptanceValidation =
  | {
      ok: true
      value: {
        email: string
        name: string
        password: string
        token: string
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

export function normalizeInviteAcceptance(input: InviteAcceptanceInput): InviteAcceptanceValidation {
  const token = String(input.token || "").trim().slice(0, 512)
  const name = String(input.name || "").trim().replace(/\s+/g, " ").slice(0, 120)
  const email = String(input.email || "").trim().toLowerCase().slice(0, 254)
  const password = String(input.password || "")

  if (token.length < 8) return { ok: false, error: "Invite link is missing or invalid." }
  if (name.length < 2) return { ok: false, error: "Enter your name." }
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: "Enter the email address used for the invite." }
  if (password.length < 10) return { ok: false, error: "Use a password with at least 10 characters." }
  if (password.length > 1024) return { ok: false, error: "Password is too long." }

  return { ok: true, value: { email, name, password, token } }
}

export function safeRedirectPath(value: unknown, fallback = "/dashboard") {
  const path = String(value || "").trim()
  if (!path || path === "/login" || path.startsWith("//") || !path.startsWith("/")) return fallback
  if (/[\r\n]/.test(path)) return fallback
  try {
    const parsed = new URL(path, "https://learn.local")
    return parsed.origin === "https://learn.local" && parsed.pathname !== "/login"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback
  } catch {
    return fallback
  }
}

export function buildForgotPasswordPlan(identifier: string) {
  if (!identifier.trim()) {
    return {
      label: "Account identifier needed",
      nextAction: "Enter your username or email first.",
      tone: "watch" as const,
    }
  }
  return {
    label: "Admin reset required",
    nextAction: "Ask an admin to verify your account and issue a fresh invite.",
    tone: "neutral" as const,
  }
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

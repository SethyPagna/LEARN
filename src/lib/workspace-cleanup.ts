import path from "node:path"

export const generatedWorkspaceTargets = [
  ".cache",
  ".next",
  ".open-next",
  ".wrangler",
  ".vercel",
  "ops/cloudflare/.wrangler",
  "ops/learn-dev-3001.out.log",
  "output",
] as const

export type GeneratedWorkspaceTarget = (typeof generatedWorkspaceTargets)[number]

export interface WorkspaceCleanupTarget {
  absolutePath: string
  exists: boolean
  reason: string
  relativePath: GeneratedWorkspaceTarget
  safe: boolean
}

export function isSafeWorkspaceCleanupTarget(rootDir: string, targetPath: string) {
  const root = path.resolve(rootDir)
  const target = path.resolve(targetPath)
  const relativePath = path.relative(root, target)

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return false
  return generatedWorkspaceTargets.includes(normalizeWorkspaceRelativePath(relativePath) as GeneratedWorkspaceTarget)
}

export function buildWorkspaceCleanupPlan(input: {
  existingPaths?: Iterable<string>
  rootDir: string
}): WorkspaceCleanupTarget[] {
  const existingPaths = new Set([...input.existingPaths ?? []].map((item) => path.resolve(item)))

  return generatedWorkspaceTargets.map((relativePath) => {
    const absolutePath = path.resolve(input.rootDir, relativePath)
    return {
      absolutePath,
      exists: existingPaths.size ? existingPaths.has(absolutePath) : true,
      reason: cleanupReasonForTarget(relativePath),
      relativePath,
      safe: isSafeWorkspaceCleanupTarget(input.rootDir, absolutePath),
    }
  })
}

function cleanupReasonForTarget(target: GeneratedWorkspaceTarget) {
  const reasons: Record<GeneratedWorkspaceTarget, string> = {
    ".cache": "local tool and build cache",
    ".next": "Next.js production build cache",
    ".open-next": "OpenNext Cloudflare build output",
    ".vercel": "local Vercel project metadata",
    ".wrangler": "local Wrangler state and cache",
    "ops/cloudflare/.wrangler": "local Wrangler state and cache for moved Cloudflare configs",
    "ops/learn-dev-3001.out.log": "local development server log",
    output: "generated deployment output",
  }

  return reasons[target]
}

function normalizeWorkspaceRelativePath(relativePath: string) {
  return relativePath.split(path.sep).join("/")
}

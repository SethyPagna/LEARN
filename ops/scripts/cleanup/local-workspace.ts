import fs from "node:fs"
import path from "node:path"
import { buildWorkspaceCleanupPlan } from "../../../lib/workspace-cleanup"

const APPLY_FLAG = "--apply"

async function main() {
  const rootDir = path.resolve(__dirname, "../../..")
  const apply = process.argv.includes(APPLY_FLAG)
  const existingPaths = buildWorkspaceCleanupPlan({ rootDir }).flatMap((target) => {
    return fs.existsSync(target.absolutePath) ? [target.absolutePath] : []
  })
  const plan = buildWorkspaceCleanupPlan({ existingPaths, rootDir })

  for (const target of plan) {
    const status = target.exists ? "found" : "missing"
    console.log(`${apply ? "clean" : "dry-run"} ${status} ${target.relativePath} - ${target.reason}`)

    if (!apply || !target.exists) continue
    if (!target.safe) throw new Error(`Refusing to remove unsafe target: ${target.absolutePath}`)

    await fs.promises.rm(target.absolutePath, { force: true, recursive: true })
  }

  if (!apply) {
    console.log(`Run with ${APPLY_FLAG} to remove generated local targets.`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

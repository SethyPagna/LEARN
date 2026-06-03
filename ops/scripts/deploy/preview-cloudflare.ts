import { spawnSync } from "node:child_process"
import path from "node:path"

const workspaceRoot = process.cwd()
const localBinPath = path.join(workspaceRoot, "ops", "run", "bin")
const deploymentPath = [localBinPath, process.env.PATH].filter(Boolean).join(path.delimiter)

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, {
    env: { ...env, PATH: deploymentPath },
    shell: true,
    stdio: "inherit",
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const cloudflareBuildEnv = {
  ...process.env,
  SKIP_WRANGLER_CONFIG_CHECK: "yes",
}

run("opennextjs-cloudflare", ["build"], cloudflareBuildEnv)
run("tsx", ["ops/scripts/deploy/patch-opennext-worker.ts"])
run("opennextjs-cloudflare", ["preview"], process.env)

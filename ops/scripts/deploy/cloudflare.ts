import { spawnSync } from "node:child_process"
import path from "node:path"

const workspaceRoot = process.cwd()
const localBinPath = path.join(workspaceRoot, "run", "bin")
const deploymentPath = [localBinPath, process.env.PATH].filter(Boolean).join(path.delimiter)

interface RunOptions {
  env?: Record<string, string | undefined>
}

function run(command: string, args: string[], options: RunOptions = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, PATH: deploymentPath, ...options.env },
    shell: process.platform === "win32",
    stdio: "inherit",
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run("tsx", ["ops/scripts/cleanup/local-workspace.ts", "--apply"])
run("tsx", ["ops/scripts/assets/sync-browser-assets.ts"])
run("opennextjs-cloudflare", ["build"], {
  env: {
    ...process.env,
    SKIP_WRANGLER_CONFIG_CHECK: "yes",
  },
})
run("wrangler", ["deploy", "--config", "ops/cloudflare/wrangler.app-deploy.jsonc"], {
  env: { OPEN_NEXT_DEPLOY: "true" },
})

import { spawnSync } from "node:child_process"

interface RunOptions {
  env?: Record<string, string | undefined>
}

function run(command: string, args: string[], options: RunOptions = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...options.env },
    shell: process.platform === "win32",
    stdio: "inherit",
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run("tsx", ["ops/scripts/cleanup/local-workspace.ts", "--apply"])
run("opennextjs-cloudflare", ["build"])
run("wrangler", ["deploy", "--config", "ops/cloudflare/wrangler.app-deploy.jsonc"], {
  env: { OPEN_NEXT_DEPLOY: "true" },
})

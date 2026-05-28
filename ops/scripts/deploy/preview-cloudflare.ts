import { spawnSync } from "node:child_process"

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, {
    env,
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
run("opennextjs-cloudflare", ["preview"], process.env)

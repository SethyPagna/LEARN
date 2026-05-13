import { spawnSync } from "node:child_process"

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...options.env },
    shell: process.platform === "win32",
    stdio: "inherit",
  })

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

run("opennextjs-cloudflare", ["build"])
run("wrangler", ["deploy", "--config", "wrangler.app-deploy.jsonc"], {
  env: { OPEN_NEXT_DEPLOY: "true" },
})

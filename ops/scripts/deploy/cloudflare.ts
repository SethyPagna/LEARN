import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const workspaceRoot = process.cwd()
const localBinPath = path.join(workspaceRoot, "ops", "run", "bin")
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

function build() {
  run("tsx", ["ops/scripts/assets/sync-browser-assets.ts"])
  run("opennextjs-cloudflare", ["build"], {
    env: { SKIP_WRANGLER_CONFIG_CHECK: "yes" },
  })
  run("tsx", ["ops/scripts/deploy/patch-opennext-worker.ts"])
}

function upload() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== "d105a82bc26b6913575355352c2d1bb1") {
    throw new Error("Upload requires the configured LEARN Cloudflare account.")
  }
  if (!fs.existsSync(path.join(workspaceRoot, ".open-next", "worker.js")) ||
      !fs.existsSync(path.join(workspaceRoot, ".open-next", "assets"))) {
    throw new Error("Upload requires the completed OpenNext build. Run the build operation first.")
  }
  run("wrangler", ["deploy", "--config", "ops/cloudflare/wrangler.app-deploy.jsonc"], {
    env: { OPEN_NEXT_DEPLOY: "true" },
  })
}

// Splitting build and upload lets releases finish compiling before touching D1.
// Do not run broad workspace cleanup here: it includes saved browser evidence.
const operation = process.argv[2] ?? "deploy"
switch (operation) {
  case "build":
    build()
    break
  case "upload":
    upload()
    break
  case "deploy":
    build()
    run("tsx", ["ops/scripts/deploy/cloudflare-preflight.ts"])
    run("wrangler", ["d1", "migrations", "apply", "learn-db", "--remote", "--config", "ops/cloudflare/wrangler.jsonc"])
    upload()
    break
  default:
    throw new Error("Expected build, upload or deploy.")
}

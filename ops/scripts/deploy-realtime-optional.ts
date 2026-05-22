import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"

const REALTIME_ENTITLEMENT_PATTERNS = [
  /entitlements\.not_available/i,
  /\bcode:\s*10007\b/i,
  /error\s+code:\s*10007/i,
]

export function isCloudflareRealtimeEntitlementError(output: string) {
  return REALTIME_ENTITLEMENT_PATTERNS.some((pattern) => pattern.test(output))
}

export function runRealtimeDeploy() {
  const result = spawnSync("wrangler", ["deploy", "--config", "wrangler.realtime.jsonc"], {
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
    stdio: ["inherit", "pipe", "pipe"],
  })

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  const output = `${result.stdout || ""}\n${result.stderr || ""}`
  if (result.status === 0) {
    return 0
  }

  if (isCloudflareRealtimeEntitlementError(output)) {
    console.warn(
      "Realtime Worker deploy skipped: Cloudflare returned the missing Workers entitlement response for learn-realtime.",
    )
    return 0
  }

  return result.status || 1
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  process.exit(runRealtimeDeploy())
}

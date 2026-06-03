import fs from "node:fs"
import path from "node:path"

const workspaceRoot = process.cwd()
const handlerPath = path.join(workspaceRoot, ".open-next", "server-functions", "default", "handler.mjs")
const unsupportedMiddlewareRequire = "getMiddlewareManifest(){return this.minimalMode?null:require(this.middlewareManifestPath)}"
const disabledMiddlewareManifest = "getMiddlewareManifest(){return null}"

if (!fs.existsSync(handlerPath)) {
  throw new Error("OpenNext handler was not generated. Run opennextjs-cloudflare build first.")
}

const handler = fs.readFileSync(handlerPath, "utf8")

if (handler.includes(disabledMiddlewareManifest)) {
  console.log("OpenNext middleware manifest patch already applied.")
  process.exit(0)
}

if (!handler.includes(unsupportedMiddlewareRequire)) {
  throw new Error("OpenNext middleware manifest patch target was not found.")
}

fs.writeFileSync(handlerPath, handler.replace(unsupportedMiddlewareRequire, disabledMiddlewareManifest))
console.log("Patched OpenNext middleware manifest require for Cloudflare runtime.")

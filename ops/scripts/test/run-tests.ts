import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const TEST_FILE_PATTERN = /\.test\.ts$/
const EXCLUDED_DIRS = new Set(["node_modules", ".next", ".open-next", ".wrangler", ".git"])

function listTestFiles(rootDir: string): string[] {
  const testFiles: string[] = []
  const pendingDirs = [path.resolve(rootDir, "src", "tests")]

  while (pendingDirs.length) {
    const currentDir = pendingDirs.pop()
    if (!currentDir) continue

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (EXCLUDED_DIRS.has(entry.name)) continue

      const entryPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        pendingDirs.push(entryPath)
        continue
      }

      if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
        testFiles.push(path.relative(rootDir, entryPath).split(path.sep).join("/"))
      }
    }
  }

  return testFiles.sort()
}

const rootDir = path.resolve(__dirname, "../../..")
const testFiles = listTestFiles(rootDir)

if (!testFiles.length) {
  console.error("No test files found under src/tests.")
  process.exit(1)
}

const result = spawnSync("tsx", ["--test", ...testFiles], {
  cwd: rootDir,
  shell: true,
  stdio: "inherit",
})

process.exit(result.status ?? 1)

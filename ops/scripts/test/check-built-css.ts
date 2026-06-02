import fs from "node:fs"
import path from "node:path"

const cssDirectory = path.resolve(".next", "static", "css")
const requiredUtilitySnippets = [
  "display:flex",
  "display:grid",
  "min-height:100vh",
]

function fail(message: string): never {
  console.error(`CSS build check failed: ${message}`)
  process.exit(1)
}

if (!fs.existsSync(cssDirectory)) {
  fail(`missing ${path.relative(process.cwd(), cssDirectory)}`)
}

const cssFiles = fs.readdirSync(cssDirectory)
  .filter((fileName) => fileName.endsWith(".css"))
  .map((fileName) => path.join(cssDirectory, fileName))

if (cssFiles.length === 0) {
  fail("no generated CSS files found")
}

const cssByFile = cssFiles.map((filePath) => ({
  filePath,
  content: fs.readFileSync(filePath, "utf8"),
}))
const combinedCss = cssByFile.map(({ content }) => content).join("\n")

const rawApplyFile = cssByFile.find(({ content }) => content.includes("@apply"))
if (rawApplyFile) {
  fail(`raw @apply leaked into ${path.relative(process.cwd(), rawApplyFile.filePath)}`)
}

const missingUtilities = requiredUtilitySnippets.filter((snippet) => !combinedCss.includes(snippet))
if (missingUtilities.length > 0) {
  fail(`Tailwind utility output is missing ${missingUtilities.join(", ")}`)
}

console.log(`CSS build check passed (${cssFiles.length} files).`)

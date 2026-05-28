import fs from "node:fs/promises"
import path from "node:path"

interface BrowserAsset {
  label: string
  sourcePath: string
  targetPath: string
}

async function copyBrowserAsset(asset: BrowserAsset) {
  const source = path.resolve(asset.sourcePath)
  const target = path.resolve(asset.targetPath)

  await fs.access(source)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.copyFile(source, target)

  console.log(`synced ${asset.label} -> ${path.relative(process.cwd(), target)}`)
}

async function main() {
  const rootDir = path.resolve(__dirname, "../../..")
  const browserAssets: BrowserAsset[] = [
    {
      label: "PPTX browser exporter",
      sourcePath: path.join(rootDir, "node_modules", "pptxgenjs", "dist", "pptxgen.min.js"),
      targetPath: path.join(rootDir, "public", "vendor", "pptxgen.min.js"),
    },
  ]

  await Promise.all(browserAssets.map(copyBrowserAsset))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

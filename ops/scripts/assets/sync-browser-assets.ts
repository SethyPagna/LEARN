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
  await fs.cp(source, target, { recursive: true })

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
  for (const filename of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
    browserAssets.push({ label: `PDF text importer ${filename}`, sourcePath: path.join(rootDir, "node_modules/pdfjs-dist/build", filename), targetPath: path.join(rootDir, "public/vendor/pdfjs", filename) })
  }
  for (const directory of ["cmaps", "standard_fonts"]) {
    browserAssets.push({ label: `PDF ${directory}`, sourcePath: path.join(rootDir, "node_modules/pdfjs-dist", directory), targetPath: path.join(rootDir, "public/vendor/pdfjs", directory) })
  }
  browserAssets.push({ label: "PDF.js license", sourcePath: path.join(rootDir, "node_modules/pdfjs-dist/LICENSE"), targetPath: path.join(rootDir, "public/vendor/pdfjs/LICENSE") })

  await Promise.all(browserAssets.map(copyBrowserAsset))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

"use client"

import { normalizeDesignDoc } from "@/lib/design/document"
import { useDesignMeasure } from "./design/text-measure"
import { DesignPageView } from "./design/design-renderer"

/** Keep the legacy migration and the editor's validated styles in the public renderer. */
export function SharedDesign({ content }: { content: unknown }) {
  const measure = useDesignMeasure()
  const design = normalizeDesignDoc(content)
  const pages = design.pages.filter((page) => !page.hidden)
  if (!pages.length) return <p className="text-sm text-muted-foreground">This design has no visible pages.</p>
  return <div className="space-y-5">{pages.map((page, index) => <figure key={page.id} className="overflow-hidden rounded-xl border border-border">
    <figcaption className="border-b border-border px-4 py-2 text-sm font-semibold">{`${design.name} · Page ${index + 1} of ${pages.length}`}</figcaption>
    <div className="max-h-[80vh] overflow-auto p-3">
      <DesignPageView width={design.width} height={design.height} theme={design.theme} page={page} measure={measure} />
    </div>
  </figure>)}</div>
}

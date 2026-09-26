import { Extension } from "@tiptap/core"

/** Preserve explicit page boundaries through TipTap parse/edit/serialization. */
export const StudioPageBreak = Extension.create({
  name: "studioPageBreak",
  addGlobalAttributes() {
    return [{
      types: ["horizontalRule"],
      attributes: {
        pageBreak: {
          default: false,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-studio-page") === "true",
          renderHTML: (attributes: Record<string, unknown>) => attributes.pageBreak ? { "data-studio-page": "true" } : {},
        },
      },
    }]
  },
})

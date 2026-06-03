export type StudioFormattingOption = {
  label: string
  value: string
}

export const studioFontOptions: StudioFormattingOption[] = [
  { label: "Aptos", value: "Aptos, Inter, sans-serif" },
  { label: "Calibri", value: "Calibri, Inter, sans-serif" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Mono", value: "'Courier New', monospace" },
]

export const studioFontSizeOptions: StudioFormattingOption[] = [
  "8px",
  "9px",
  "10px",
  "11px",
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
  "36px",
  "48px",
  "72px",
].map((value) => ({
  label: value.replace("px", ""),
  value,
}))

export const studioTextColorOptions: StudioFormattingOption[] = [
  { label: "Default", value: "inherit" },
  { label: "Ink", value: "#111827" },
  { label: "Blue", value: "#2563eb" },
  { label: "Green", value: "#059669" },
  { label: "Red", value: "#dc2626" },
  { label: "Purple", value: "#7c3aed" },
]

export const studioHighlightColorOptions: StudioFormattingOption[] = [
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Pink", value: "#fbcfe8" },
]

export function findStudioFormattingOption(options: StudioFormattingOption[], value: string) {
  return options.find((option) => option.value === value) || null
}

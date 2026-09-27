import { createElement } from "../studio/canvas-engine"
import { createDesignDoc, createDesignPage } from "./document"

export const demoPageColors = [
  { name: "Periwinkle", value: "#d5d4f6" },
  { name: "Apricot", value: "#f6c8b6" },
  { name: "Mint", value: "#c6e5ce" },
] as const

/** Stable ids keep the public example identical on the server and during hydration. */
export function createPublicDemo() {
  return createDesignDoc({
    id: "public-studio-demo",
    name: "My curious idea",
    format: "custom",
    width: 960,
    height: 600,
    theme: "notebook",
    pages: [createDesignPage({
      id: "public-demo-page",
      background: demoPageColors[0].value,
      pattern: "none",
      elements: [
        createElement({ id: "demo-flower", type: "shape", x: 678, y: 34, width: 254, height: 254, rotation: -12, z: 0, style: { shape: "burst", fill: "#786fbd", strokeWidth: 0 } }),
        createElement({ id: "demo-eyebrow", type: "text", x: 48, y: 43, width: 650, height: 30, z: 1, content: "COLLECTING GOOD IDEAS / 001", style: { fontFamily: "sans", fontSize: 17, fontWeight: 600, color: "#302944", letterSpacing: 0.12, fit: "grow", padding: 0 } }),
        createElement({ id: "demo-heading", type: "text", x: 44, y: 168, width: 680, height: 306, z: 2, content: "Stay\ncurious.", style: { fontFamily: "sans", fontSize: 148, fontWeight: 700, color: "#252444", lineHeight: 0.94, letterSpacing: -0.055, fit: "grow", padding: 0 } }),
        createElement({ id: "demo-stamp", type: "shape", x: 742, y: 89, width: 150, height: 150, rotation: 12, z: 3, content: "THINK IT.\nMAKE IT.", style: { shape: "ellipse", fill: "#f9c7b3", color: "#302944", fontFamily: "sans", fontSize: 20, fontWeight: 700 } }),
        createElement({ id: "demo-footer", type: "text", x: 48, y: 545, width: 640, height: 25, z: 4, content: "A little wonder goes a long way.", style: { fontFamily: "sans", fontSize: 17, color: "#302944", fit: "grow", padding: 0 } }),
      ],
    })],
  })
}

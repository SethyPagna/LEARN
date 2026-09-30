import { createElement } from "../studio/canvas-engine"
import { createDesignDoc, createDesignPage, type DesignDoc } from "./document"

export const publicDemoProjects = [
  { id: "canvas", label: "Canvas", name: "Stay curious" },
  { id: "slides", label: "Slides", name: "Small ideas" },
  { id: "poster", label: "Poster", name: "Follow your curiosity" },
] as const

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

/** Each sample is a real design document; switching projects never fetches account data. */
export function createPublicDemoProjects(): DesignDoc[] {
  return [createPublicDemo(), createSlidesDemo(), createPosterDemo()]
}

function createSlidesDemo(): DesignDoc {
  return createDesignDoc({
    id: "public-slides-demo",
    name: "Small ideas",
    format: "custom",
    width: 960,
    height: 540,
    theme: "midnight",
    pages: [
      createDesignPage({
        id: "demo-slide-cover",
        background: "#171a35",
        elements: [
          createElement({ id: "demo-slide-orbit", type: "shape", x: 646, y: 36, width: 268, height: 268, rotation: 15, style: { shape: "burst", fill: "#ada8ff", strokeWidth: 0 } }),
          createElement({ id: "demo-slide-tag", type: "text", x: 52, y: 52, width: 570, height: 30, z: 1, content: "A LITTLE CREATIVE EXPERIMENT", style: { fontFamily: "space", fontSize: 17, color: "#94dad8", letterSpacing: 0.1, padding: 0, fit: "grow" } }),
          createElement({ id: "demo-slide-heading", type: "text", x: 50, y: 158, width: 630, height: 232, z: 2, content: "Small ideas.\nBig possibilities.", style: { fontFamily: "space", fontSize: 86, fontWeight: 700, color: "#ffffff", lineHeight: 1.04, letterSpacing: -0.04, padding: 0, fit: "grow" } }),
          createElement({ id: "demo-slide-dot", type: "shape", x: 820, y: 421, width: 58, height: 58, z: 3, style: { shape: "ellipse", fill: "#ffb6a2", strokeWidth: 0 } }),
        ],
      }),
      createDesignPage({
        id: "demo-slide-process",
        background: "#f3f0ff",
        elements: [
          createElement({ id: "demo-process-heading", type: "text", x: 52, y: 55, width: 820, height: 80, content: "An idea takes shape.", style: { fontFamily: "space", fontSize: 57, fontWeight: 700, color: "#292648", padding: 0, fit: "grow" } }),
          ...["Capture", "Create", "Share"].map((content, index) => createElement({ id: `demo-process-card-${index}`, type: "shape", x: 52 + index * 288, y: 209, width: 268, height: 230, z: index + 1, content, style: { shape: "rounded", fill: ["#d5d4f6", "#f6c8b6", "#c6e5ce"][index], borderRadius: 30, fontFamily: "space", fontSize: 38, fontWeight: 600, color: "#292648", strokeWidth: 0 } })),
        ],
      }),
      createDesignPage({
        id: "demo-slide-end",
        background: "#c6e5ce",
        elements: [
          createElement({ id: "demo-end-star", type: "shape", x: 632, y: 165, width: 234, height: 234, rotation: 12, style: { shape: "star", fill: "#447662", strokeWidth: 0 } }),
          createElement({ id: "demo-end-heading", type: "text", x: 55, y: 175, width: 630, height: 235, z: 1, content: "Make it\nyours.", style: { fontFamily: "space", fontSize: 100, fontWeight: 700, color: "#253f34", lineHeight: 0.96, padding: 0, fit: "grow" } }),
        ],
      }),
    ],
  })
}

function createPosterDemo(): DesignDoc {
  return createDesignDoc({
    id: "public-poster-demo",
    name: "Follow your curiosity",
    format: "custom",
    width: 720,
    height: 960,
    theme: "sunset",
    pages: [createDesignPage({
      id: "demo-poster-page",
      background: "#f6c8b6",
      elements: [
        createElement({ id: "demo-poster-star", type: "shape", x: 400, y: 500, width: 275, height: 275, rotation: 8, style: { shape: "burst", fill: "#d35638", strokeWidth: 0 } }),
        createElement({ id: "demo-poster-tag", type: "text", x: 45, y: 42, width: 630, height: 35, z: 1, content: "A CREATIVE STATE OF MIND", style: { fontFamily: "sans", fontSize: 16, fontWeight: 600, color: "#73362b", letterSpacing: 0.1, padding: 0, fit: "grow" } }),
        createElement({ id: "demo-poster-heading", type: "text", x: 42, y: 165, width: 630, height: 452, z: 2, content: "FOLLOW\nYOUR\nCURIOSITY.", style: { fontFamily: "bebas", fontSize: 142, fontWeight: 400, color: "#3e2927", lineHeight: 0.94, letterSpacing: -0.01, padding: 0, fit: "grow" } }),
        createElement({ id: "demo-poster-note", type: "text", x: 48, y: 819, width: 545, height: 50, rotation: -4, z: 3, content: "Good things begin with a question.", style: { fontFamily: "caveat", fontSize: 29, fontWeight: 600, color: "#73362b", padding: 0, fit: "grow" } }),
      ],
    })],
  })
}

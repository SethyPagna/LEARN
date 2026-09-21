import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LEARN",
    short_name: "LEARN",
    description:
      "A Cloudflare-first learning workspace for notes, quizzes, files, AI tutoring, and progress.",
    start_url: "/",
    display: "standalone",
    background_color: "#040506",
    theme_color: "#040506",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        // The Web App Manifest spec allows a space-separated purpose list
        // ("any maskable"); Next's type only models a single value, so the
        // literal is widened rather than splitting the icon into two entries.
        purpose: "any maskable" as "any" | "maskable",
      },
      {
        src: "/icon-light-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/icon-dark-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  }
}

import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LEARN",
    short_name: "LEARN",
    description:
      "Your workspace for projects, notes, practice and learning together.",
    id: "/",
    scope: "/",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#202433",
    theme_color: "#202433",
    icons: [
      { src: "/icons/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
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
    shortcuts: [
      { name: "Projects", url: "/dashboard" },
      { name: "Calendar", url: "/calendar" },
      { name: "AI tutor", url: "/ai" },
    ],
  }
}

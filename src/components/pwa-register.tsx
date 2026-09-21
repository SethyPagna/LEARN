"use client"

import { useEffect } from "react"

/**
 * Registers the offline shell worker (`public/sw.js`).
 *
 * Production and secure origins only: in dev the worker would hold stale
 * assets across hot reloads, and browsers refuse to register a service worker
 * outside https/localhost anyway. The worker itself skips every `/api/`
 * request, so registering it never puts private data in the cache.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return

    const secureOrigin =
      window.location.protocol === "https:" || window.location.hostname === "localhost"
    if (!secureOrigin) return

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is an enhancement; a failed registration must never
        // break the app.
      })
    }

    if (document.readyState === "complete") {
      register()
      return
    }

    window.addEventListener("load", register, { once: true })
    return () => window.removeEventListener("load", register)
  }, [])

  return null
}

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
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV !== "production") {
      // Refresh a worker left by a local production preview without installing
      // one in development. Its local-asset bypass prevents stale hot reloads.
      void navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration?.active?.scriptURL === new URL("/sw.js", window.location.origin).href) return registration.update()
      }).catch(() => {})
      return
    }

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

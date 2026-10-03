"use client"

import { useEffect } from "react"

/**
 * Last resort for failures in the root layout itself. The global stylesheet and
 * providers are not guaranteed to be mounted here, so this renders its own
 * document with inline styles and imports nothing from the app shell.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Global error:", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#040506",
          color: "#ffffff",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          lineHeight: 1.6,
        }}
      >
        <main style={{ maxWidth: "30rem", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: "1.35rem", fontWeight: 600 }}>LEARN could not start</h1>
          <p style={{ margin: "0 0 16px", fontSize: "0.95rem", color: "rgba(255, 255, 255, 0.68)" }}>
            A critical error stopped the app from loading. Retrying will reload this page.
          </p>
          {error.digest ? (
            <p style={{ margin: "0 0 16px", fontSize: "0.8rem", color: "rgba(255, 255, 255, 0.45)" }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              borderRadius: "12px",
              border: "none",
              padding: "10px 16px",
              fontSize: "0.9rem",
              fontWeight: 500,
              background: "#ffffff",
              color: "#040506",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  )
}

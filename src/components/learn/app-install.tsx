"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Download, MonitorCheck } from "lucide-react"

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const InstallContext = createContext({ available: false, installed: false, busy: false, error: "", install: async () => {} })

export function AppInstallProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)")
    const updateDisplay = () => setInstalled(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
    const capturePrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent) }
    const complete = () => { setInstalled(true); setPrompt(null) }
    updateDisplay()
    display.addEventListener("change", updateDisplay)
    window.addEventListener("beforeinstallprompt", capturePrompt)
    window.addEventListener("appinstalled", complete)
    return () => {
      display.removeEventListener("change", updateDisplay)
      window.removeEventListener("beforeinstallprompt", capturePrompt)
      window.removeEventListener("appinstalled", complete)
    }
  }, [])
  async function install() {
    if (!prompt || busy) return
    setBusy(true)
    setError("")
    try {
      await prompt.prompt()
      await prompt.userChoice
    } catch {
      setError("Installation could not start. Try your browser’s Install app option.")
    } finally {
      setPrompt(null)
      setBusy(false)
    }
  }
  return <InstallContext.Provider value={{ available: Boolean(prompt) && !installed, installed, busy, error, install }}>{children}</InstallContext.Provider>
}

export function InstallAppButton() {
  const { available, busy, install } = useContext(InstallContext)
  if (!available) return null
  return <button type="button" disabled={busy} className="editor-command" onClick={() => void install()}><Download className="h-4 w-4" />Install app</button>
}

export function InstallAppSettings() {
  const { installed, error } = useContext(InstallContext)
  return <section className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5" aria-label="Desktop app">
    <div className="flex items-center gap-3"><MonitorCheck className="h-5 w-5 text-muted-foreground" /><div><h3 className="text-sm font-medium">LEARN on your desktop</h3><p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">{installed ? "You’re using the installed app." : "Open LEARN in its own window. Use Install app here, or your browser’s Install app or Add to Dock option when available."}</p></div></div>
    <InstallAppButton />
    {error ? <p role="alert" className="w-full text-xs text-destructive">{error}</p> : null}
  </section>
}

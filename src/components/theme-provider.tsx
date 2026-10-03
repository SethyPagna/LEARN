'use client'

import * as React from 'react'
import {
  ThemeProvider as NextThemesProvider,
  useTheme,
  type ThemeProviderProps,
} from 'next-themes'
import { applyAppearanceOptions, resolveThemeMode, themeModes } from '@/lib/appearance'
import { parseStoredWorkspaceOptions, WORKSPACE_OPTIONS_KEY } from '@/lib/workspace-preferences'

function AppearanceSync() {
  const { theme, systemTheme, setTheme } = useTheme()

  React.useEffect(() => {
    const mode = resolveThemeMode(theme, systemTheme)
    // Keep existing system preferences readable, then migrate to one explicit mode.
    if (theme !== mode) setTheme(mode)
    const color = mode === 'dark' ? '#212121' : '#ffffff'
    function updateChrome() {
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
        if (meta.getAttribute('content') !== color) meta.setAttribute('content', color)
        if (meta.hasAttribute('media')) meta.removeAttribute('media')
      })
    }
    updateChrome()
    // App Router can replace metadata during navigation without remounting us.
    const observer = new MutationObserver(updateChrome)
    observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content', 'media'] })
    return () => observer.disconnect()
  }, [theme, systemTheme, setTheme])

  React.useEffect(() => {
    function restore() {
      try { applyAppearanceOptions(parseStoredWorkspaceOptions(localStorage.getItem(WORKSPACE_OPTIONS_KEY))) } catch { /* Storage can be disabled by the browser. */ }
    }
    function onStorage(event: StorageEvent) {
      if (event.key === WORKSPACE_OPTIONS_KEY || event.key === null) restore()
    }
    restore()
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return null
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider attribute="class" defaultTheme="color" themes={[...themeModes]} enableSystem enableColorScheme={false} disableTransitionOnChange {...props}><AppearanceSync />{children}</NextThemesProvider>
}

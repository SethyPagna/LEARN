"use client"

import { createContext, useContext, useLayoutEffect, type RefObject } from "react"

export type EditorExitGuard = () => Promise<boolean>
export const EditorNavigationContext = createContext<RefObject<EditorExitGuard | null> | null>(null)

/** Keep the latest editor save function available before changing projects. */
export function useEditorExitGuard(guard: EditorExitGuard) {
  const registration = useContext(EditorNavigationContext)
  useLayoutEffect(() => {
    if (!registration) return
    registration.current = guard
    return () => { if (registration.current === guard) registration.current = null }
  }, [guard, registration])
}

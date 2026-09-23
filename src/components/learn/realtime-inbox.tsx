"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { RealtimeSocket, type RealtimeFrame, type RealtimeStatus } from "@/lib/realtime/client"

/**
 * The signed-in person's realtime inbox: one socket per tab, opened once by
 * the shell and shared by everything that needs server pushes (the
 * notification bell, new-message badges, incoming calls).
 *
 * Being connected here is also what "online" means to everyone else, so the
 * socket stays open for as long as the app is.
 */

type Listener = (frame: RealtimeFrame) => void

interface InboxContextValue {
  status: RealtimeStatus
  subscribe: (type: string, listener: Listener) => () => void
}

const InboxContext = createContext<InboxContextValue | null>(null)

export function RealtimeInboxProvider({ children, userId }: { children: ReactNode; userId: string | null | undefined }) {
  const listeners = useRef(new Map<string, Set<Listener>>())
  const [status, setStatus] = useState<RealtimeStatus>("closed")

  useEffect(() => {
    if (!userId) return
    const socket = new RealtimeSocket({
      kind: "inbox",
      id: userId,
      onStatus: setStatus,
      onFrame: (frame) => {
        for (const listener of listeners.current.get(frame.type) ?? []) listener(frame)
        for (const listener of listeners.current.get("*") ?? []) listener(frame)
      },
    }).start()
    return () => socket.close()
  }, [userId])

  const subscribe = useCallback((type: string, listener: Listener) => {
    const set = listeners.current.get(type) ?? new Set<Listener>()
    set.add(listener)
    listeners.current.set(type, set)
    return () => {
      set.delete(listener)
      if (!set.size) listeners.current.delete(type)
    }
  }, [])

  const value = useMemo(() => ({ status, subscribe }), [status, subscribe])
  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
}

/** Runs `handler` for every inbox frame of `type` ("*" for all) while mounted. */
export function useInboxEvent(type: string, handler: Listener) {
  const context = useContext(InboxContext)
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    if (!context) return
    return context.subscribe(type, (frame) => handlerRef.current(frame))
  }, [context, type])
}

export function useInboxStatus(): RealtimeStatus {
  return useContext(InboxContext)?.status ?? "closed"
}

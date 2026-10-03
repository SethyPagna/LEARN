export interface CallPeer {
  callId: string
  peerUserId: string
  peerDevice?: string
  status: "outgoing" | "incoming" | "connected"
}

/** A group invitation may accept one answer; subsequent signals belong to that peer. */
export function acceptsCallSignal(call: CallPeer | null, signal: { callId: string; kind: string; userId: string; device?: string }) {
  if (!call || signal.callId !== call.callId) return false
  if (call.peerUserId && signal.userId !== call.peerUserId) return false
  if (call.peerDevice && signal.device !== call.peerDevice) return false
  if (!call.peerUserId) return call.status === "outgoing" && signal.kind === "answer"
  if (signal.kind === "answer") return call.status === "outgoing"
  return true
}

/** Serializes saves and drains edits that arrive while a request is in flight. */
export function createLatestSaveQueue(options: { isDirty: () => boolean; saveOnce: () => Promise<boolean> }) {
  let running: Promise<boolean> | null = null
  return {
    flush(): Promise<boolean> {
      if (running) return running
      const drain = async () => {
        while (options.isDirty()) {
          if (!(await options.saveOnce())) return false
        }
        return true
      }
      running = drain().finally(() => { running = null })
      return running
    },
  }
}

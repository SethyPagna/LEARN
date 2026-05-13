export default {
  async fetch(request, env) {
    if (!env.LEARN_WORKER) {
      return new Response("LEARN Worker service binding is not configured.", { status: 503 })
    }

    return env.LEARN_WORKER.fetch(request)
  },
}

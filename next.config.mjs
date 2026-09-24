import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "worker-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://gateway.ai.cloudflare.com https://api.cloudflare.com https://*.r2.cloudflarestorage.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    // camera and microphone must stay `(self)`. The app calls
    // navigator.mediaDevices.getUserMedia({ audio: true, video }) for group
    // calling and call recording (views/productivity-views.tsx:655). An empty
    // allowlist `camera=()` / `microphone=()` makes the browser reject that
    // request *before* any permission prompt, so the feature fails with
    // "Couldn't access your camera/microphone" every time. The remaining
    // directives are genuinely unused and stay denied.
    value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  // Deliberately without `includeSubDomains` or `preload`: this header would
  // otherwise apply to sibling subdomains of whatever host the app is served
  // from, and preload is a hard-to-reverse commitment. Enable them only after
  // confirming every subdomain is HTTPS-only.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/api/:path*',
        headers: [
          ...securityHeaders,
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ]
  },
}

export default nextConfig

if (!process.env.VERCEL) {
  // Local dev must read the same D1 store the migration script writes to.
  //
  // This repo keeps its wrangler config under ops/cloudflare/, not at the repo
  // root. With no `configPath` the OpenNext dev proxy finds no wrangler.jsonc
  // and provides no D1 binding at all, so every database route answers
  // "Cloudflare D1 is not configured". `persist.path` then has to line up with
  // `pnpm db:migrate:local`'s `--persist-to` root plus wrangler's own `v3`
  // suffix; if the two disagree, dev reads a different (empty) SQLite file and
  // every query fails with "no such table: users".
  // src/tests/project/local-d1-store.test.ts keeps these two in sync.
  initOpenNextCloudflareForDev({
    configPath: "ops/cloudflare/wrangler.jsonc",
    persist: { path: ".wrangler/state/v3" },
  })
}

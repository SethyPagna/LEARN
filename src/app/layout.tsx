import React from "react"
import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { PwaRegister } from '@/components/pwa-register'
import { designFontVariables } from '@/components/learn/design/design-fonts'
import './globals.css'

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
// Headings only: a grotesque with a hand-drawn warmth, so titles read like a
// notebook's section labels while body text stays in Geist.
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-learn-display", display: "swap" })

export const metadata: Metadata = {
  title: 'LEARN',
  description: 'A Cloudflare-first learning workspace for notes, quizzes, files, AI tutoring, and progress.',
  generator: 'LEARN',
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        sizes: '32x32',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
  // Installed-app chrome: LEARN runs standalone once added to the home screen.
  appleWebApp: {
    capable: true,
    title: 'LEARN',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  // Matches the app's page backgrounds (src/app/page.tsx) so the browser and
  // installed-app chrome do not flash a mismatched colour.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6faf7' },
    { media: '(prefers-color-scheme: dark)', color: '#040506' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${display.variable} ${designFontVariables}`}>
      <body className="font-sans antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: "globalThis.__name=globalThis.__name||function(fn){return fn}",
          }}
        />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  )
}

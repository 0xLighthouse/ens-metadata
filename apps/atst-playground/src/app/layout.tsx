import type { Metadata, Viewport } from 'next'

import './globals.css'

import { Footer } from '@/components/Footer'

const TITLE = 'ATST Playground'
const DESCRIPTION = 'Tools for learning how to create and verify ENS text record attestations.'

/** Set at deploy time. The default only makes the local build coherent. */
const SITE_URL = process.env.ATST_SITE_URL ?? 'http://localhost:3002'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: TITLE,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    locale: 'en',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    creator: '@LighthouseGov',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf7' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b09' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Footer />
      </body>
    </html>
  )
}

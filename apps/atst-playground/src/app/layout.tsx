import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'ATST Playground',
  description: 'Verify, take apart, and sign ENS social media account attestations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

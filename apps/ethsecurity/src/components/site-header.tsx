import Link from 'next/link'

import { ThemeToggle } from '@/components/ui/theme-toggle'

export function SiteHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[hsl(var(--line))] px-4">
      <Link href="/" className="text-h4">
        ETHSecurity Badgeholders
      </Link>
      <ThemeToggle />
    </header>
  )
}

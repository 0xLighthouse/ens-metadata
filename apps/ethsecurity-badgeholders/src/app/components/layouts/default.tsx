import { Compass, Github } from 'lucide-react'
import Link from 'next/link'

import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { ThemeToggle } from '@/components/ui/theme-toggle'

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-white text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50">
      <header className="relative isolate z-[60] flex h-16 shrink-0 items-center bg-white px-4 sm:px-8 dark:bg-neutral-950">
        {/* Mobile layout */}
        <div className="flex w-full items-center sm:hidden">
          <Link
            href="/"
            className="text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
            aria-label="Badgeholders"
          >
            <Compass className="size-5" />
          </Link>
          <div className="flex flex-1 justify-center">
            <span className="text-sm font-medium">ETHSecurity Badgeholders</span>
          </div>
          <ThemeToggle />
        </div>

        {/* Desktop layout */}
        <div className="hidden flex-1 sm:flex">
          <PageBreadcrumbs />
        </div>
        <div className="hidden flex-1 items-center justify-end gap-2 sm:flex">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col p-4">
        <section className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl bg-[rgb(247,247,248)] p-0 dark:bg-neutral-900">
          {children}
        </section>
      </main>

      <footer className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-8">
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          © {new Date().getFullYear()} Lighthouse Labs
        </p>
        <a
          href="https://github.com/0xLighthouse"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          <Github className="size-3" />
          GitHub
        </a>
      </footer>
    </div>
  )
}

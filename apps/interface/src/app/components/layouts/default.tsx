import { AuthGate } from '@/components/auth/auth-gate'
import { DomainGate } from '@/components/auth/domain-gate'
import { ConnectButton } from '@/components/connect-button'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { DOCS_NAV_URL, SCHEMAS_NAV_URL } from '@/config/constants'
import { colorSystem } from '@/config/theme'
import { BookOpenText, ExternalLink, FileJson, Github } from 'lucide-react'
import { TreeButtonGroup } from '../tree-button-group'

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  const isExternal = (href: string) => href.startsWith('http')

  const getLinkProps = (href: string) =>
    isExternal(href)
      ? {
          target: '_blank',
          rel: 'noreferrer',
        }
      : {}

  const navLinkClasses =
    'inline-flex h-10 items-center justify-center rounded-md bg-transparent px-4 text-sm font-medium hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-700 dark:hover:text-neutral-50'

  return (
    <div className="flex min-h-svh flex-col bg-white text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50">
      {/* HEADER */}
      <header className="flex h-16 shrink-0 items-center px-4 sm:px-8">
        <div className="flex-1">
          <PageBreadcrumbs />
        </div>

        <div className="flex-shrink-0">
          <TreeButtonGroup />
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <div className="hidden lg:flex items-center gap-1">
            <a
              href={DOCS_NAV_URL}
              className={navLinkClasses}
              aria-label={isExternal(DOCS_NAV_URL) ? 'Docs (opens in new tab)' : 'Docs'}
              {...getLinkProps(DOCS_NAV_URL)}
            >
              <BookOpenText className="size-4 mr-2" />
              Docs
            </a>
            <a
              href={SCHEMAS_NAV_URL}
              className={navLinkClasses}
              aria-label={isExternal(SCHEMAS_NAV_URL) ? 'Schemas (opens in new tab)' : 'Schemas'}
              {...getLinkProps(SCHEMAS_NAV_URL)}
            >
              <FileJson className="size-4 mr-2" />
              Schemas
            </a>
          </div>
          <a
            href="https://github.com/0xLighthouse/ens-node-metadata"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository (opens in new tab)"
            className="flex items-center justify-center rounded-full p-2 text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200 transition-colors"
          >
            <Github className="size-4" />
          </a>
          <ThemeToggle />
          <ConnectButton />
        </div>
      </header>

      {/* MAIN */}
      <main className="flex min-h-0 flex-1 flex-col p-4">
        <section className={`flex min-h-0 flex-1 flex-col rounded-2xl p-0 ${colorSystem.bg.panel}`}>
          <AuthGate>
            <DomainGate>{children}</DomainGate>
          </AuthGate>
        </section>
      </main>
    </div>
  )
}

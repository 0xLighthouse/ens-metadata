import { BadgeholderList } from '@/components/badgeholder-list'
import { loadBadgeholderRows } from '@/lib/badgeholders'
import { PageInset } from './components/containers'

/** Rendered on demand: the fetchers cache, and the list must never be baked into the build. */
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const rows = await loadBadgeholderRows()

  return (
    <PageInset>
      <h1 className="text-2xl font-bold">ETHSecurity Badgeholders</h1>
      <p className="text-body-sm text-neutral-500 dark:text-neutral-400">
        A directory of badgeholders and the identity information they have published on-chain.
      </p>

      <div className="mt-3">
        <BadgeholderList rows={rows} />
      </div>
    </PageInset>
  )
}

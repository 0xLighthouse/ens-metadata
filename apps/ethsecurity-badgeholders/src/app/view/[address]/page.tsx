import { BadgeholderProfile } from '@/components/badgeholder-profile'
import { findBadgeholderRow } from '@/lib/badgeholders'
import { rowLabel } from '@/lib/identity'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageInset } from '../../components/containers'

type Props = { params: Promise<{ address: string }> }

/** Rendered on demand: the fetchers cache, and no profile is baked into the build. */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params
  const row = await findBadgeholderRow(address)
  if (!row) return { title: 'Not a badgeholder' }
  return { title: `${rowLabel(row).primary} · ETHSecurity Badgeholders` }
}

export default async function BadgeholderPage({ params }: Props) {
  const { address } = await params
  const row = await findBadgeholderRow(address)
  if (!row) notFound()

  return (
    <PageInset>
      <BadgeholderProfile row={row} />
    </PageInset>
  )
}

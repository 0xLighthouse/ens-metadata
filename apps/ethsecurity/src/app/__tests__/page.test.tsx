import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { metadata } from '@/app/layout'
import HomePage from '@/app/page'
import { SiteHeader } from '@/components/site-header'

const html = renderToStaticMarkup(<HomePage />)
const headerHtml = renderToStaticMarkup(<SiteHeader />)

const MEMBER_RE = /\bmembers?\b/
const COUNCIL_RE = /\bcouncils?\b/

function assertNoCouncilOrMemberCopy(copy: string) {
  const lower = copy.toLowerCase()
  expect(lower).not.toMatch(COUNCIL_RE)
  expect(lower).not.toMatch(MEMBER_RE)
}

describe('HomePage', () => {
  it('renders the page title', () => {
    expect(html).toContain('ETHSecurity Badgeholders')
  })

  it('renders an empty state that names the group badgeholders', () => {
    expect(html).toContain('No badgeholders yet')
    expect(html).toContain('badgeholder')
  })

  it('never calls the group a council, and never calls its people members', () => {
    assertNoCouncilOrMemberCopy(html)
  })

  it('uses the shared type scale rather than ad-hoc font sizes', () => {
    expect(html).toContain('text-h1')
    expect(html).toContain('text-body-lg')
  })
})

describe('SiteHeader', () => {
  it('never calls the group a council, and never calls its people members', () => {
    assertNoCouncilOrMemberCopy(headerHtml)
  })
})

describe('metadata', () => {
  it('never calls the group a council, and never calls its people members', () => {
    assertNoCouncilOrMemberCopy(`${metadata.title} ${metadata.description}`)
  })
})

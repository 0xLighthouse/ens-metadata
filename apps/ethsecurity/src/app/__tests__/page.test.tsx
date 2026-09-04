import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import HomePage from '@/app/page'

const html = renderToStaticMarkup(<HomePage />)

describe('HomePage', () => {
  it('renders the page title', () => {
    expect(html).toContain('ETHSecurity Badgeholders')
  })

  it('renders an empty state that names the group badgeholders', () => {
    expect(html).toContain('No badgeholders yet')
    expect(html).toContain('badgeholder')
  })

  it('never calls the group a council, and never calls its people members', () => {
    const copy = html.toLowerCase()
    expect(copy).not.toContain('council')
    expect(copy).not.toContain('member')
  })

  it('uses the shared type scale rather than ad-hoc font sizes', () => {
    expect(html).toContain('text-h1')
    expect(html).toContain('text-body-lg')
  })
})

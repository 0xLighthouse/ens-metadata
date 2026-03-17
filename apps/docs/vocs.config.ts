import { defineConfig } from 'vocs'
import { navGenerator } from './lib/navgen'

// Usage: pass a subdirectory (within docs/pages) to the navGenerator to generate links for all files in that directory
const nav = new navGenerator(__dirname)

export default defineConfig({
  aiCta: false,
  head: {
    script: [
      {
        src: 'https://cloud.umami.is/script.js',
        defer: true,
        'data-website-id': '327bc99a-c5a0-457e-8a63-ab3d476d6542',
      },
    ],
  },
  title: 'ENS Organizational Registry',
  description: 'ENS-based organizational identity and metadata registry protocol',
  logoUrl: '/ens-mark-white.svg',
  iconUrl: '/favicon.ico',
  rootDir: '.',
  sidebar: [
    {
      text: 'Overview',
      collapsed: false,
      items: nav.navItems('/overview'),
    },
    {
      text: 'Schemas',
      collapsed: false,
      items: nav.navItems('/schemas'),
    },
    {
      text: 'Use cases',
      collapsed: false,
      items: nav.navItems('/use-cases'),
    },
    {
      text: 'SDK',
      collapsed: false,
      items: nav.navItems('/sdk'),
    },
    {
      text: 'CLI',
      collapsed: false,
      items: nav.navItems('/cli'),
    },
  ],
})

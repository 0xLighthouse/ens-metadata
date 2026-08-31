import Image from 'next/image'

const LINKS = [
  { href: 'https://ensmetadata.app/', label: 'ENS Metadata' },
  { href: 'https://identity.ensmetadata.app/profile-builder', label: 'Profile Builder' },
  { href: 'https://lighthouse.cx/', label: 'Lighthouse' },
  { href: 'https://x.com/LighthouseGov', label: '@LighthouseGov' },
  { href: 'https://atst.me/', label: 'atst.me' },
  { href: 'https://docs.ens.domains/ensip/27', label: 'ENSIP-27' },
]

export function Footer() {
  return (
    <footer className="mx-auto max-w-4xl border-t border-rule px-6 py-6">
      <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        {LINKS.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="text-muted hover:text-ink"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-center">
        <Image src="/images/lighthouse-logo.png" alt="Lighthouse" width={104} height={29} />
      </div>
    </footer>
  )
}

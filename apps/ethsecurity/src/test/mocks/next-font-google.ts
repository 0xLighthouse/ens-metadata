// next/font/google relies on a Next.js build-time transform that isn't present
// under plain Vitest. Stub it so modules that call Geist()/Geist_Mono() (e.g.
// src/app/layout.tsx) can be imported from tests without pulling in Next's
// build pipeline.
export function Geist(_options: unknown) {
  return { variable: '', className: '' }
}

export function Geist_Mono(_options: unknown) {
  return { variable: '', className: '' }
}

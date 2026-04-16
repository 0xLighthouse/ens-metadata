/**
 * Match a value against a comma-separated allowlist. Entries are either:
 *   - Exact strings (e.g. `https://identity.ensmetadata.app`), or
 *   - Single-wildcard patterns (e.g. `https://*-8640p.vercel.app`). The `*`
 *     only matches hostname-safe characters — alphanumerics, `.`, `-` — so
 *     it can't escape the origin via `/`, `:`, `?`, `#`, `@`.
 */
export function parseAllowlist(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function matchesAllowlist(value: string, entries: string[]): boolean {
  for (const entry of entries) {
    if (entry === value) return true
    const star = entry.indexOf('*')
    if (star === -1) continue
    if (entry.indexOf('*', star + 1) !== -1) continue
    const prefix = entry.slice(0, star)
    const suffix = entry.slice(star + 1)
    if (value.length < prefix.length + suffix.length) continue
    if (!value.startsWith(prefix)) continue
    if (!value.endsWith(suffix)) continue
    const middle = value.slice(prefix.length, value.length - suffix.length)
    if (!/^[a-zA-Z0-9.-]+$/.test(middle)) continue
    return true
  }
  return false
}

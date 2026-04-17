/**
 * ENSIP-5 global text record keys. These are universal across every ENS
 * name — a schema defines extra fields ON TOP of this set, not instead
 * of it. Any validator asking "is this key part of the schema?" should
 * also accept anything in this list.
 *
 * Source: https://docs.ens.domains/ensip/5
 */
export const ENSIP5_GLOBAL_KEYS: ReadonlySet<string> = new Set([
  'avatar',
  'description',
  'display',
  'email',
  'keywords',
  'location',
  'mail',
  'notice',
  'phone',
  'url',
])

export function isEnsip5Global(key: string): boolean {
  return ENSIP5_GLOBAL_KEYS.has(key)
}

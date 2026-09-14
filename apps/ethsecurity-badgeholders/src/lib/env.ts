import { DEFAULT_BADGEHOLDERS_DUNE_QUERY_ID } from '@/lib/constants'

/**
 * Server-only environment checks. Keep this module out of client bundles: it reads
 * non-public env vars.
 */

/** Whether Privy is configured, which enables the wallet button and profile editing. */
export const isWalletEnabled = (): boolean => Boolean(process.env.ESB_PRIVY_APP_ID)

/**
 * A Dune query id from its raw env value: a positive whole number, surrounding whitespace
 * ignored. `null` for anything else, including an unset or empty value, a URL, `0`, a
 * negative, a decimal, or a number too large to be exact.
 */
export const parseDuneQueryId = (raw: string | undefined): number | null => {
  const trimmed = raw?.trim()
  if (!trimmed || !/^\d+$/.test(trimmed)) return null
  const id = Number(trimmed)
  return id > 0 && Number.isSafeInteger(id) ? id : null
}

/**
 * The Dune query the badgeholder list comes from: `DUNE_BADGELIST_QUERY_ID` when it holds a
 * valid id, otherwise `DEFAULT_BADGEHOLDERS_DUNE_QUERY_ID`. A set but invalid value falls back
 * too, with a warning, so a typo cannot empty the directory.
 */
export const badgeholdersDuneQueryId = (): number => {
  const raw = process.env.DUNE_BADGELIST_QUERY_ID
  const id = parseDuneQueryId(raw)
  if (id !== null) return id
  if (raw?.trim()) {
    console.warn(
      `DUNE_BADGELIST_QUERY_ID must be a numeric Dune query id; got ${JSON.stringify(raw)}. Using ${DEFAULT_BADGEHOLDERS_DUNE_QUERY_ID}.`,
    )
  }
  return DEFAULT_BADGEHOLDERS_DUNE_QUERY_ID
}

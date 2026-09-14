/**
 * Server-only environment checks. Keep this module out of client bundles: it reads
 * non-public env vars.
 */

/** Whether Privy is configured, which enables the wallet button and profile editing. */
export const isWalletEnabled = (): boolean => Boolean(process.env.ESB_PRIVY_APP_ID)

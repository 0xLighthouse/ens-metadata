/** X (Twitter) handle: 4-15 characters, letters, digits and underscores only. */
const X_HANDLE_RE = /^[A-Za-z0-9_]{4,15}$/

/** Telegram handle: 5-32 characters, letters, digits and underscores only. */
const TELEGRAM_HANDLE_RE = /^[A-Za-z0-9_]{5,32}$/

// The WHATWG HTML living standard's "valid e-mail address" regex, verbatim — the same one
// browsers use to validate <input type="email">.
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

export const isValidXHandle = (value: string) => X_HANDLE_RE.test(value)

export const isValidTelegramHandle = (value: string) => TELEGRAM_HANDLE_RE.test(value)

export const isValidEmail = (value: string) => EMAIL_RE.test(value)

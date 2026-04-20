/**
 * Shared style constants for the wizard UI.
 *
 * Every inline Tailwind class string used across wizard steps is declared
 * here so that styling changes can be made in one place.
 */

export const wizardStyles = {
  // ---------------------------------------------------------------------------
  // Status / feedback boxes
  // ---------------------------------------------------------------------------

  /** Red error box with flex layout for optional icon — used across all steps. */
  errorBox:
    'flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',

  /** Yellow warning box — EnterAttributes load error. */
  warningBox:
    'rounded-md border border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-3 text-xs text-yellow-900 dark:text-yellow-100',

  /** Green success box — ReviewStep done state. */
  successBox:
    'rounded-md border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950 p-4 text-sm',

  /** Neutral info/loading box — EnterAttributes loading, social unlinked info. */
  infoBox:
    'rounded-md border border-neutral-200 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400',

  /** Dashed neutral box — ReviewStep "nothing changed" empty state. */
  emptyStateBox:
    'rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400',

  /** Rose missing-required-fields warning — EnterAttributes. */
  requiredWarningBox:
    'rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100',

  // ---------------------------------------------------------------------------
  // Inline elements (icons, labels inside status boxes)
  // ---------------------------------------------------------------------------

  /** Alert icon inside error boxes. */
  errorIcon: 'h-4 w-4 mt-0.5 shrink-0',

  /** Large green checkmark in success box. */
  successIcon: 'h-5 w-5 text-green-600 dark:text-green-400 mt-0.5',

  /** "Transaction confirmed" heading inside success box. */
  successTitle: 'font-medium text-green-900 dark:text-green-100',

  /** Transaction hash inside success box. */
  successHash: 'font-mono text-xs break-all text-green-800 dark:text-green-200',

  /** Small green checkmark next to linked account handle. */
  checkIcon: 'h-4 w-4 text-green-500 shrink-0',

  // ---------------------------------------------------------------------------
  // Badges / labels
  // ---------------------------------------------------------------------------

  /** Rose "required" pill badge on form fields. */
  requiredBadge:
    'rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',

  /** Muted "optional" label on form fields. */
  optionalLabel: 'text-xs text-neutral-400 dark:text-neutral-500',

  /** Muted "connected" label next to linked account handle. */
  connectedLabel: 'text-neutral-400 dark:text-neutral-500 text-xs',

  // ---------------------------------------------------------------------------
  // Connected wallet / account rows
  // ---------------------------------------------------------------------------

  /** Bordered row with flex layout and padding — wallet connected state. */
  borderedRow:
    'flex items-center justify-between rounded-md border border-neutral-200 dark:border-neutral-700 px-4 py-3',

  /** Bordered container shell — wraps swappable inner content. */
  borderedContainer:
    'rounded-md border border-neutral-200 dark:border-neutral-700 overflow-hidden',

  /** Inner row for linked social account (handle + disconnect). */
  connectedAccountRow: 'flex items-center justify-between px-4 py-3',

  /** Inner padding for unlinked social account state. */
  unlinkedAccountInner: 'p-4 space-y-4',

  // ---------------------------------------------------------------------------
  // Typography
  // ---------------------------------------------------------------------------

  /** Monospace text. */
  mono: 'font-mono',

  /** Monospace bold — account handles. */
  monoSemibold: 'font-mono font-semibold',

  /** Neutral muted text — labels, descriptions. */
  mutedText: 'text-neutral-500 dark:text-neutral-400',

  /** Small help text — field descriptions beneath inputs. */
  helpText: 'text-xs text-neutral-500 dark:text-neutral-400',

  /** Body text in info sections — social unlinked descriptions. */
  bodyText: 'text-sm text-neutral-600 dark:text-neutral-400',

  /** Small muted text — wallet "Connected" label. */
  mutedLabel: 'text-neutral-500 dark:text-neutral-400',

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  /** Vertical spacing — primary card content. */
  stack6: 'space-y-6',

  /** Vertical spacing — tighter sections. */
  stack4: 'space-y-4',

  /** Vertical spacing — field groups. */
  stack2: 'space-y-2',

  /** Horizontal button row — Back + Continue. */
  buttonRow: 'flex gap-2',

  /** Field header — label + required/optional badge. */
  fieldHeader: 'flex items-center justify-between',

  // ---------------------------------------------------------------------------
  // Links (button-styled)
  // ---------------------------------------------------------------------------

  /** Outline link styled as a button — Etherscan link. */
  outlineLink:
    'inline-flex w-full items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 hover:bg-neutral-100 dark:hover:bg-neutral-800 h-10 px-4 py-2 text-sm font-medium transition-colors',

  /** Primary link styled as a button — "View proof" link. */
  primaryLink:
    'inline-flex w-full items-center justify-center rounded-md bg-neutral-900 text-neutral-50 hover:bg-neutral-900/90 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-50/90 h-10 px-4 py-2 text-sm font-medium transition-colors',

  /** Subtle inline link — "View on Etherscan" during confirmation. */
  subtleLink:
    'flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors',

  // ---------------------------------------------------------------------------
  // Icon sizing
  // ---------------------------------------------------------------------------

  /** Small icon with right margin — used inline in buttons. */
  iconSm: 'h-4 w-4 mr-2',

  /** Extra-small icon — used standalone. */
  iconXs: 'h-3.5 w-3.5',
} as const

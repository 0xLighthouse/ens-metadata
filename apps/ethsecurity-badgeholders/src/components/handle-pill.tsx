'use client'

import { TelegramIcon } from '@/components/icons/telegram'
import { XIcon } from '@/components/icons/x'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ContactField, HandleField } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Mail, TriangleAlert } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

export type HandlePlatform = 'x' | 'telegram' | 'email'

type PillField = HandleField | ContactField

const PLATFORMS: Record<
  HandlePlatform,
  {
    label: string
    icon: ComponentType<SVGProps<SVGSVGElement>>
    base: string
    prefix: string
    /** Whether the platform can carry an attestation, which drives the warning marker and tooltip. */
    verifiable: boolean
  }
> = {
  x: { label: 'X', icon: XIcon, base: 'https://x.com/', prefix: '@', verifiable: true },
  telegram: {
    label: 'Telegram',
    icon: TelegramIcon,
    base: 'https://t.me/',
    prefix: '@',
    verifiable: true,
  },
  email: { label: 'Email', icon: Mail, base: 'mailto:', prefix: '', verifiable: false },
}

const SET =
  'border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'

const STYLES: Record<PillField['state'], string> = {
  empty:
    'border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-700 dark:text-neutral-500',
  unattested: SET,
  attested: SET,
  unverifiable: SET,
}

const TOOLTIPS: Record<'unattested' | 'attested', (label: string) => string> = {
  unattested: (label) => `This ${label} handle is unverified`,
  attested: (label) => `This ${label} handle is verified`,
}

const SR_SUFFIXES: Record<PillField['state'], string> = {
  empty: '',
  unattested: ', unverified',
  attested: ', verified',
  unverifiable: '',
}

/** `warning` picks a `dot` for the tight directory rows, a `triangle` where the profile page has more room. */
export function HandlePill({
  platform,
  field,
  warning = 'dot',
  className,
}: {
  platform: HandlePlatform
  field: PillField
  warning?: 'dot' | 'triangle'
  className?: string
}) {
  const { label, icon: Icon, base, prefix, verifiable } = PLATFORMS[platform]
  const handle = field.state === 'empty' ? null : field.handle
  const tooltip =
    verifiable && (field.state === 'unattested' || field.state === 'attested')
      ? TOOLTIPS[field.state](label)
      : null

  const classes = cn(
    'inline-flex h-6 max-w-48 items-center gap-1.5 rounded-md border px-2 text-xs font-medium',
    handle !== null && 'transition-opacity hover:opacity-80',
    STYLES[field.state],
    className,
  )
  const suffix = SR_SUFFIXES[field.state]
  const content = (
    <>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">{`${label}: `}</span>
      {/* Only the handle gives ground when the row runs out of width. */}
      <span className="min-w-0 truncate">{handle === null ? 'Unknown' : `${prefix}${handle}`}</span>
      {field.state === 'unattested' &&
        (warning === 'triangle' ? (
          <TriangleAlert
            className="size-3.5 shrink-0 text-orange-500 dark:text-orange-400"
            aria-hidden="true"
          />
        ) : (
          <span
            className="size-2 shrink-0 rounded-full bg-orange-500 dark:bg-orange-400"
            aria-hidden="true"
          />
        ))}
      {/* Radix only wires `aria-describedby` while the tooltip is open, so state is repeated here. */}
      {suffix && <span className="sr-only">{suffix}</span>}
    </>
  )

  const pill =
    handle === null ? (
      <span className={classes}>{content}</span>
    ) : (
      <a
        href={`${base}${handle}`}
        // `target`/`rel` only make sense for the http profile links, not for `mailto:`.
        {...(base.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
        className={classes}
      >
        {content}
      </a>
    )

  if (tooltip === null) return pill

  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent className="text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  )
}

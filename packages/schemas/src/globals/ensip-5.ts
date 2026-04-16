import type { Schema } from '../types'

export const ENSIP5: Schema = {
  $id: 'https://docs.ens.domains/ensip/5',
  source: 'https://docs.ens.domains/ensip/5',
  title: 'ENSIP-5',
  version: '1.0.0',
  description:
    'A group of entities that have been empowered by a larger organization to undertake some activity.',
  type: 'object' as const,
  properties: {
    avatar: {
      type: 'string',
      description: 'A URL to an image used as an avatar or logo',
    },
    description: {
      type: 'string',
      description: 'A description of the name',
    },
    display: {
      type: 'string',
      description:
        'A canonical display name for the ENS name; this MUST match the ENS name when its case is folded, and clients should ignore this value if it does not (e.g. "ricmoo.eth" could set this to "RicMoo.eth")',
    },
    email: {
      type: 'string',
      description: 'An e-mail address',
    },
    keywords: {
      type: 'string',
      description:
        'A list of comma-separated keywords, ordered by most significant first; clients that interpresent this field may choose a threshold beyond which to ignore',
    },
    mail: {
      type: 'string',
      description: 'A physical mailing address',
    },
    notice: {
      type: 'string',
      description: 'A notice regarding this name',
    },
    location: {
      type: 'string',
      description: 'A generic location (e.g. "Toronto, Canada")',
    },
    phone: {
      type: 'string',
      description: 'A phone number as an E.164 string',
    },
    url: {
      type: 'string',
      description: 'A website URL',
    },
  },
}

import { readFileSync } from 'node:fs'
import { publishFile } from '@ensmetadata/shared'
import { z } from 'zod'
import { validateRegistrationFile } from '../../../index.js'

export const publishCommand = {
  description: 'Publish registration file to IPFS via Pinata',
  args: z.object({
    file: z.string().describe('Path to registration-file.json'),
  }),
  options: z.object({}),
  env: z.object({
    PINATA_JWT: z.string().optional().describe('Pinata JWT (preferred)'),
    PINATA_API_KEY: z.string().optional().describe('Pinata API key (use with secret)'),
    PINATA_API_SECRET: z.string().optional().describe('Pinata API secret (use with key)'),
  }),
  async run(c: {
    args: { file: string }
    env: { PINATA_JWT?: string; PINATA_API_KEY?: string; PINATA_API_SECRET?: string }
  }) {
    const { PINATA_JWT, PINATA_API_KEY, PINATA_API_SECRET } = c.env
    if (!PINATA_JWT && !(PINATA_API_KEY && PINATA_API_SECRET)) {
      throw new Error(
        'Missing Pinata credentials. Set PINATA_JWT or both PINATA_API_KEY and PINATA_API_SECRET.',
      )
    }

    const raw: unknown = JSON.parse(readFileSync(c.args.file, 'utf8'))
    const result = validateRegistrationFile(raw)
    if (!result.success) {
      throw new Error(
        `Invalid registration file:\n${result.error.issues
          .map((i) => `[${i.path.join('.') || 'root'}] ${i.message}`)
          .join('\n')}`,
      )
    }

    const { cid } = await publishFile({
      provider: 'pinata',
      filePath: c.args.file,
      pinataJwt: PINATA_JWT,
      pinataKey: PINATA_API_KEY,
      pinataSecret: PINATA_API_SECRET,
      schemaId: result.data.name,
      version: '1.0.0',
    })

    return { cid, uri: `ipfs://${cid}` }
  },
}

import { DEFAULT_ATTESTER_ENS } from '@ensmetadata/sdk'
import { z } from 'zod'
import { chainForName } from '../../../lib/chain-for-name.js'
import {
  globalEnv,
  globalOptions,
  publicClientForName,
  validateName,
} from '../../../lib/context.js'
import { verifyHandleAttestation } from '../../../lib/verify-attestation.js'

const verifyHandleOptions = globalOptions.extend({
  attester: z
    .string()
    .default(DEFAULT_ATTESTER_ENS)
    .describe('Attester ENS name (defaults to atst.lighthousegov.eth)'),
  maxAge: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Reject claims older than this many seconds'),
})

export const verifyHandleCommand = {
  description: 'Verify a handle attestation on an ENS name',
  args: z.object({
    name: z.string().describe('ENS name (e.g. myagent.eth)'),
    platform: z.string().describe('Platform namespace (e.g. com.x, org.telegram)'),
  }),
  options: verifyHandleOptions,
  env: globalEnv,
  async run(ctx: {
    args: { name: string; platform: string }
    options: z.infer<typeof verifyHandleOptions>
    env: z.infer<typeof globalEnv>
  }) {
    const ensName = validateName(ctx.args.name)
    const { client, chain } = publicClientForName(ctx, ensName)
    if (chainForName(ctx.options.attester).id !== chain.id) {
      throw new Error(
        `--attester must be an ENS name on the same chain as the subject (${chain.name}).`,
      )
    }

    const result = await verifyHandleAttestation(
      client,
      {
        ...(chain.ensRegistry ? { registry: chain.ensRegistry } : {}),
      },
      {
        name: ensName,
        platform: ctx.args.platform,
        attester: ctx.options.attester,
      },
    )

    const maxAge = ctx.options.maxAge
    if (result.valid && maxAge !== undefined) {
      const now = Math.floor(Date.now() / 1000)
      if (now - result.issuedAt > maxAge) {
        return {
          valid: false as const,
          reason: 'stale' as const,
          handle: result.handle,
          issuedAt: result.issuedAt,
          attester: result.attester,
          attesterAddress: result.attesterAddress,
        }
      }
    }
    return result
  },
}

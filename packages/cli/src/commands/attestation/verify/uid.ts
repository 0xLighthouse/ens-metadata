import { defaultAttesterEnsForName } from '@ensmetadata/sdk'
import { chainForName } from '@ensmetadata/shared/chain-for-name'
import { z } from 'zod'
import {
  globalEnv,
  globalOptions,
  publicClientForName,
  validateName,
} from '../../../lib/context.js'
import { verifyUidAttestation } from '../../../lib/verify-attestation.js'

const verifyUidOptions = globalOptions.extend({
  attester: z
    .string()
    .optional()
    .describe('Attester ENS name. Auto-resolves from the subject chain when omitted.'),
  maxAge: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Reject claims older than this many seconds'),
})

export const verifyUidCommand = {
  description: 'Verify a uid attestation on an ENS name',
  args: z.object({
    name: z.string().describe('ENS name (e.g. myagent.eth)'),
    platform: z.string().describe('Platform namespace (e.g. com.x, org.telegram)'),
    uid: z.string().describe('Raw uid the attestation was signed against'),
  }),
  options: verifyUidOptions,
  env: globalEnv,
  async run(ctx: {
    args: { name: string; platform: string; uid: string }
    options: z.infer<typeof verifyUidOptions>
    env: z.infer<typeof globalEnv>
  }) {
    const ensName = validateName(ctx.args.name)
    const { client, chain } = publicClientForName(ctx, ensName)
    const attesterEns = ctx.options.attester ?? defaultAttesterEnsForName(ensName)
    if (chainForName(attesterEns).id !== chain.id) {
      throw new Error(
        `--attester must be an ENS name on the same chain as the subject (${chain.name}).`,
      )
    }

    const result = await verifyUidAttestation(
      client,
      {
        ...(chain.ensRegistry ? { registry: chain.ensRegistry } : {}),
      },
      {
        name: ensName,
        platform: ctx.args.platform,
        uid: ctx.args.uid,
        attester: attesterEns,
      },
    )

    const maxAge = ctx.options.maxAge
    if (result.valid && maxAge !== undefined) {
      const now = Math.floor(Date.now() / 1000)
      if (now - result.issuedAt > maxAge) {
        return {
          valid: false as const,
          reason: 'stale' as const,
          uid: result.uid,
          issuedAt: result.issuedAt,
          attester: result.attester,
          attesterAddress: result.attesterAddress,
        }
      }
    }
    return result
  },
}

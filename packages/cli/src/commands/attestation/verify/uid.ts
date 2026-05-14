import { DEFAULT_ATTESTER_ENS } from '@ensmetadata/sdk'
import { z } from 'zod'
import { chainForName } from '../../../lib/chain-for-name.js'
import { MAINNET_CHAIN } from '../../../lib/chains.js'
import {
  globalEnv,
  globalOptions,
  publicClientForChain,
  publicClientForName,
  validateName,
} from '../../../lib/context.js'
import { verifyUidAttestation } from '../../../lib/verify-attestation.js'

const verifyUidOptions = globalOptions.extend({
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

export const verifyUidCommand = {
  description: 'Verify a uid attestation on an ENS name',
  args: z.object({
    name: z.string().describe('ENS name (e.g. myagent.eth)'),
    platform: z.string().describe('Platform namespace (e.g. com.x, org.telegram)'),
    uid: z.string().describe('Raw uid the attestation was signed against'),
  }),
  options: verifyUidOptions,
  env: globalEnv,
  async run(c: {
    args: { name: string; platform: string; uid: string }
    options: z.infer<typeof verifyUidOptions>
    env: z.infer<typeof globalEnv>
  }) {
    const ensName = validateName(c.args.name)
    if (chainForName(c.options.attester).id !== 1) {
      throw new Error(
        '--attester must be a mainnet ENS name. Attesters on other chains are not yet supported.',
      )
    }
    const { client: subjectClient, chain } = publicClientForName(c, ensName)
    const attesterClient =
      chain.id === MAINNET_CHAIN.id
        ? subjectClient
        : publicClientForChain(c, MAINNET_CHAIN, { applyRpcFlag: false })

    return verifyUidAttestation(
      subjectClient,
      {
        attesterClient,
        ...(chain.ensRegistry ? { registry: chain.ensRegistry } : {}),
        ...(c.options.maxAge !== undefined ? { maxAge: c.options.maxAge } : {}),
      },
      {
        name: ensName,
        platform: c.args.platform,
        uid: c.args.uid,
        attester: c.options.attester,
      },
    )
  },
}

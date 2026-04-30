import { addEnsContracts } from '@ensdomains/ensjs'
import { DEFAULT_ATTESTER_ENS, verifyHandleAttestation } from '@ensmetadata/sdk'
import { type PublicClient, createPublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import { z } from 'zod'
import {
  buildFallbackTransport,
  globalEnv,
  globalOptions,
  resolveRpcUrl,
  validateName,
} from '../../../lib/context.js'

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
  async run(c: {
    args: { name: string; platform: string }
    options: z.infer<typeof verifyHandleOptions>
    env: z.infer<typeof globalEnv>
  }) {
    const ensName = validateName(c.args.name)
    const rpcUrl = resolveRpcUrl(mainnet.id, c.options, c.env as Record<string, string | undefined>)
    const transport = buildFallbackTransport(mainnet.id, rpcUrl, mainnet.rpcUrls.default.http)
    const client = createPublicClient({
      chain: addEnsContracts(mainnet),
      transport,
    }) as unknown as PublicClient

    return verifyHandleAttestation(
      client,
      c.options.maxAge !== undefined ? { maxAge: c.options.maxAge } : {},
      {
        name: ensName,
        platform: c.args.platform,
        attester: c.options.attester,
      },
    )
  },
}

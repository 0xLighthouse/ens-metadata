import { Box, Text, useApp } from 'ink'
import React from 'react'
import { http, createPublicClient } from 'viem'
import { z } from 'zod'
import IdentityRegistryABI from '../../../lib/abis/IdentityRegistry.json' with { type: 'json' }
import { SUPPORTED_CHAINS, resolveChain } from '../../../lib/registry.js'

export const description = 'Query agent identity on ERC-8004 registry'

export const options = z.object({
  chainName: z
    .enum(SUPPORTED_CHAINS)
    .default('mainnet')
    .describe('Chain name (e.g. mainnet, base, arbitrum, optimism)'),
})

export const args = z.tuple([z.string().describe('agent-id (token ID)')])

type Props = {
  options: z.infer<typeof options>
  args: z.infer<typeof args>
}

type QueryResult = {
  owner: string
  tokenId: bigint
  agentUri: string
  chain: string
  registryAddress: string
}

type State =
  | { status: 'loading' }
  | { status: 'done'; identity: QueryResult }
  | { status: 'error'; message: string }

export default function Query({
  options: { chainName },
  args: [agentId],
}: Props) {
  const { exit } = useApp()
  const [state, setState] = React.useState<State>({ status: 'loading' })

  React.useEffect(() => {
    if (state.status === 'done') exit()
    else if (state.status === 'error') exit(new Error(state.message))
  }, [state, exit])

  React.useEffect(() => {
    async function run() {
      const { chain, registryAddress } = resolveChain(chainName)

      try {
        const client = createPublicClient({ chain, transport: http() })
        const tokenId = BigInt(agentId)

        const [owner, uri] = await Promise.all([
          client.readContract({
            address: registryAddress,
            abi: IdentityRegistryABI,
            functionName: 'ownerOf',
            args: [tokenId],
          }),
          client.readContract({
            address: registryAddress,
            abi: IdentityRegistryABI,
            functionName: 'tokenURI',
            args: [tokenId],
          }),
        ])

        setState({
          status: 'done',
          identity: {
            owner: owner as string,
            tokenId,
            agentUri: uri as string,
            chain: chainName,
            registryAddress,
          },
        })
      } catch (err) {
        setState({
          status: 'error',
          message: `Registry read failed: ${(err as Error).message}`,
        })
      }
    }

    run()
  }, [chainName, agentId])

  return (
    <Box flexDirection="column">
      {state.status === 'loading' && <Text color="cyan">Querying ERC-8004 registry…</Text>}
      {state.status === 'done' && (
        <Box flexDirection="column">
          <Text color="green">✅ Agent Identity ({state.identity.chain})</Text>
          <Text> Agent URI: {state.identity.agentUri}</Text>
          <Text> Owner: {state.identity.owner}</Text>
          <Text> Token ID: {state.identity.tokenId.toString()}</Text>
          <Text> Registry: {state.identity.registryAddress}</Text>
        </Box>
      )}
      {state.status === 'error' && <Text color="red">❌ {state.message}</Text>}
    </Box>
  )
}

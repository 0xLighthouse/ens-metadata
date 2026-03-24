import { http, createPublicClient } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL!, {
    batch: {
      batchSize: 128,
    },
  }),
})

export async function fetchTexts(ensName: string, keys: string[]) {
  console.log('fetchTexts()', ensName, keys)
  const calls = keys.map((key) =>
    client.getEnsText({
      name: ensName,
      key,
    }),
  )
  const results = await Promise.all(calls)
  return Object.fromEntries(keys.map((k, i) => [k, results[i]]))
}

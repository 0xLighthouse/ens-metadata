import { http, GetEnsNameReturnType, createPublicClient } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http('https://ethereum-rpc.publicnode.com', {
    batch: {
      batchSize: 1024,
    },
  }),
})

type Address = `0x${string}`

export type ENSDataByAddress = Map<Address, { name: GetEnsNameReturnType; avatar: string | null }>

export async function mapNamesByAddress(addresses: Address[]): Promise<ENSDataByAddress> {
  const names = await Promise.all(addresses.map((address) => client.getEnsName({ address })))

  const avatars = await Promise.all(
    names.map(async (name) => {
      if (!name) return null
      try {
        return await client.getEnsAvatar({ name })
      } catch (err) {
        console.log(`Failed to fetch avatar for ${name}:`, err)
        return null
      }
    }),
  )

  return new Map(
    addresses.map((address, index) => [address, { name: names[index], avatar: avatars[index] }]),
  )
}

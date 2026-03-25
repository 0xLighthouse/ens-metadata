import { NextRequest, NextResponse } from 'next/server'
import { http, createPublicClient } from 'viem'
import { mainnet } from 'viem/chains'

const SAFE_ABI = [
  {
    type: 'function',
    name: 'getOwners',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'getThreshold',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { node } = body

    if (!node?.address) {
      return NextResponse.json({ error: 'Node address is required' }, { status: 400 })
    }

    // Create viem client with fallback to public RPC
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL!

    const client = createPublicClient({
      chain: mainnet,
      transport: http(rpcUrl),
    })

    const nodeClass = node.texts?.class

    // biome-ignore lint/suspicious/noExplicitAny: inspection result shape is built dynamically
    const result: any = {
      address: node.address,
      class: nodeClass,
      detectedType: null,
      metadata: {},
    }

    // For Treasury nodes, attempt to detect if it's a Safe multisig
    if (nodeClass === 'Treasury') {
      try {
        // Try to read Safe contract methods
        const [owners, threshold] = await Promise.all([
          client.readContract({
            abi: SAFE_ABI,
            address: node.address as `0x${string}`,
            functionName: 'getOwners',
          }),
          client.readContract({
            abi: SAFE_ABI,
            address: node.address as `0x${string}`,
            functionName: 'getThreshold',
          }),
        ])

        // Resolve ENS names and avatars for signers
        const signers = await Promise.all(
          owners.map(async (ownerAddress) => {
            try {
              const ensName = await client.getEnsName({ address: ownerAddress })
              let ensAvatar = null
              if (ensName) {
                try {
                  ensAvatar = await client.getEnsAvatar({ name: ensName })
                } catch (err) {
                  console.log(`Failed to fetch avatar for ${ensName}:`, err)
                }
              }
              return {
                address: ownerAddress,
                ensName,
                ensAvatar,
              }
            } catch (err) {
              console.log(`Failed to resolve ENS for ${ownerAddress}:`, err)
              return {
                address: ownerAddress,
                ensName: null,
                ensAvatar: null,
              }
            }
          }),
        )

        result.detectedType = 'Safe Multisig'
        result.metadata = {
          signers,
          threshold: Number(threshold),
          signerCount: signers.length,
          thresholdRatio: `${threshold}/${signers.length}`,
        }
      } catch (error) {
        // Not a Safe or method call failed
        console.log('Not a Safe multisig or detection failed:', error)
        result.detectedType = 'Unknown Contract'
        result.metadata = {
          note: 'Unable to detect as Safe multisig',
        }
      }
    }

    // Check if it's an EOA (Externally Owned Account)
    try {
      const code = await client.getBytecode({
        address: node.address as `0x${string}`,
      })

      if (!code || code === '0x') {
        result.detectedType = 'EOA (Externally Owned Account)'
        result.metadata = {
          note: 'This is a wallet address, not a contract',
        }
      }
    } catch (error) {
      console.error('Error checking bytecode:', error)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error inspecting node:', error)
    return NextResponse.json(
      { error: 'Failed to inspect node', details: (error as Error).message },
      { status: 500 },
    )
  }
}

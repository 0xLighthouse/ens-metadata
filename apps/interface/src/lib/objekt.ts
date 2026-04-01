import type { WalletClient } from 'viem'
import { sha256 } from 'viem'

const OBJEKT_ENS_API = 'https://ens.objekt.sh'

export const AVATAR_MAX_SIZE = 512 * 1024 // 512KB
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export type StorageTier = 'cdn' | 'ipfs' | 'arweave'

export const STORAGE_TIERS: Record<
  StorageTier,
  { label: string; price: string; description: string }
> = {
  cdn: { label: 'CDN', price: 'Free', description: '90-day cache' },
  ipfs: { label: 'IPFS', price: '$0.20/MB', description: '12-month pin' },
  arweave: { label: 'Arweave', price: '~$0.09/MB', description: 'Permanent' },
}

interface UploadAvatarParams {
  file: File
  ensName: string
  storageTier: StorageTier
  walletClient: WalletClient
  switchChain: (chainId: number) => Promise<void>
}

interface UploadResult {
  uri: string
  permalink: string
  kind: string
  bytes: number
}

function validateFile(file: File) {
  if (!AVATAR_MIME_TYPES.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Use JPEG, PNG, or WebP.`)
  }
  if (file.size > AVATAR_MAX_SIZE) {
    throw new Error(`File too large: ${(file.size / 1024).toFixed(0)}KB. Max is 512KB.`)
  }
}

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

async function createPaymentFetch(
  walletClient: WalletClient,
  switchChain: (chainId: number) => Promise<void>,
): Promise<typeof globalThis.fetch> {
  const { wrapFetchWithPayment, x402Client } = await import('@x402/fetch')
  const { ExactEvmScheme } = await import('@x402/evm/exact/client')

  const signer = {
    address: walletClient.account!.address,
    signTypedData: async (msg: Record<string, unknown>) => {
      // x402 payments settle on Base (8453) but the Privy wallet is connected
      // to mainnet. Switch to Base for signing, then restore mainnet.
      await switchChain(8453)
      try {
        return await walletClient.signTypedData({ account: walletClient.account!, ...msg } as never)
      } finally {
        await switchChain(1)
      }
    },
  }

  const client = new x402Client()
  client.register('eip155:8453', new ExactEvmScheme(signer as never))

  return wrapFetchWithPayment(fetch, client)
}

export async function uploadAvatar({
  file,
  ensName,
  storageTier,
  walletClient,
  switchChain,
}: UploadAvatarParams): Promise<UploadResult> {
  validateFile(file)

  const [dataURL, arrayBuffer] = await Promise.all([fileToDataURL(file), file.arrayBuffer()])

  const bytes = new Uint8Array(arrayBuffer)
  const hash = sha256(bytes)
  const expiry = String(Date.now() + 60_000)
  const address = walletClient.account?.address
  if (!address) throw new Error('Wallet not connected')

  const sig = await walletClient.signTypedData({
    account: address,
    domain: { name: 'Objekt', version: '1' },
    types: {
      Upload: [
        { name: 'upload', type: 'string' },
        { name: 'expiry', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'hash', type: 'string' },
      ],
    },
    primaryType: 'Upload',
    message: { upload: 'avatar', expiry, name: ensName, hash },
  })

  const tierParam = storageTier !== 'cdn' ? `?storage=${storageTier}` : ''
  // TODO: make upload type dynamic based on the field key (avatar, header, etc.)
  const url = `${OBJEKT_ENS_API}/${ensName}/avatar${tierParam}`

  // For paid tiers, wrap fetch with x402 payment handler
  const doFetch =
    storageTier !== 'cdn' ? await createPaymentFetch(walletClient, switchChain) : fetch

  const res = await doFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataURL,
      sig,
      expiry,
      unverifiedAddress: address,
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Upload failed (${res.status})`)
  }

  return res.json()
}

import type { WalletClient } from 'viem'
import { sha256 } from 'viem'
import { createPaymentFetch } from './objekt-payment'

// Staging endpoint for Objekt blob uploads. Swap to production when it lands.
const OBJEKT_ENS_API = 'https://stage.ens.objekt.sh'

export type StorageTier = 'cdn' | 'ipfs'

export interface UploadProofArgs {
  bytes: Uint8Array
  ensName: string
  /** Record key under the ens-scoped blob namespace, e.g. 'proof.twitter'. */
  key: string
  tier: StorageTier
  walletClient: WalletClient
  switchChain: (chainId: number) => Promise<void>
}

export interface UploadProofResult {
  /** `ipfs://<cid>` when the tier returned one, `null` for CDN uploads. */
  uri: string | null
  permalink: string
  bytes: number
  /** What goes into `claim.prf` — uri when present, permalink otherwise. */
  reference: string
}

interface ObjektBlobResponse {
  uri: string | null
  permalink: string
  bytes: number
}

export async function uploadProof(args: UploadProofArgs): Promise<UploadProofResult> {
  const { bytes, ensName, key, tier, walletClient, switchChain } = args

  const address = walletClient.account?.address
  if (!address) throw new Error('Wallet not connected')

  const hash = sha256(bytes)
  const expiry = String(Date.now() + 60_000)
  const uploadField = `blob/${key}`

  // Mainnet-scoped EIP-712 signature — no chain switch needed. The Base
  // chain-switch only happens inside createPaymentFetch for the x402 step.
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
    message: { upload: uploadField, expiry, name: ensName, hash },
  })

  const url = `${OBJEKT_ENS_API}/${ensName}/blob/${key}?storage=${tier}`
  const doFetch = tier === 'ipfs' ? await createPaymentFetch(walletClient, switchChain) : fetch

  // The body slice is a copy scoped to this Uint8Array's byte range — avoids
  // leaking adjacent buffer bytes if `bytes` is backed by a shared ArrayBuffer.
  const body = bytes.slice().buffer
  const res = await doFetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/cbor',
      'X-Upload-Sig': sig,
      'X-Upload-Expiry': expiry,
      'X-Upload-Address': address,
    },
    body,
  })

  if (!res.ok) {
    let message = `Upload failed (${res.status})`
    try {
      const errBody = (await res.json()) as { message?: string; error?: string }
      message = errBody.message ?? errBody.error ?? message
    } catch {
      // non-JSON error body — fall back to status message
    }
    throw new Error(message)
  }

  const data = (await res.json()) as ObjektBlobResponse
  const reference = data.uri ?? data.permalink
  return {
    uri: data.uri,
    permalink: data.permalink,
    bytes: data.bytes,
    reference,
  }
}

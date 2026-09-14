import {
  type AttestationEntry,
  attest,
  bindPlatform,
  bindWallet,
  createSession,
} from '@/lib/attester-client'
import { PLATFORM_LABELS, type SocialPlatform } from '@/lib/social'
import { MAINNET_CHAIN } from '@ensmetadata/shared/chains'
import { getAccessToken } from '@privy-io/react-auth'
import type { Address, WalletClient } from 'viem'
import { createSiweMessage } from 'viem/siwe'

export type AttestPhase = 'siwe' | 'binding' | 'attesting'

export type PendingLink = { platform: SocialPlatform; handle: string; uid: string }

const SIWE_STATEMENT =
  'Sign this message to confirm your intent to link the resources listed below. This will not make any changes to your ENS profile.'

/**
 * Asks the attester to sign the pending social handles for `name`, after
 * `apps/identity/src/hooks/use-attestation-flow.ts`: mint a session, sign a SIWE message that
 * names the ENS name and every handle, bind the wallet and each Privy-linked platform, then
 * request the attestations. `issuer` must be the wallet that manages `name`, since the
 * attestation binds the handle to that address.
 */
export async function createAttestations(args: {
  name: string
  walletClient: WalletClient
  issuer: Address
  pending: readonly PendingLink[]
  onPhase: (phase: AttestPhase) => void
}): Promise<{ sessionId: string; entries: AttestationEntry[] }> {
  const session = await createSession()

  args.onPhase('siwe')
  const message = createSiweMessage({
    address: args.issuer,
    chainId: MAINNET_CHAIN.id,
    domain: window.location.host,
    nonce: session.nonce,
    uri: window.location.origin,
    version: '1',
    statement: SIWE_STATEMENT,
    resources: [
      `ens:${args.name}`,
      ...args.pending.map((link) => `social:${link.platform}:${link.handle}`),
    ],
    issuedAt: new Date(),
  })
  const signature = await args.walletClient.signMessage({ account: args.issuer, message })

  args.onPhase('binding')
  await bindWallet({ sessionId: session.sessionId, message, signature })
  const privyAccessToken = (await getAccessToken().catch(() => null)) ?? undefined
  await Promise.all(
    args.pending.map((link) =>
      bindPlatform({
        sessionId: session.sessionId,
        platform: link.platform,
        payload: { privyAccessToken, uid: link.uid, handle: link.handle },
      }),
    ),
  )

  args.onPhase('attesting')
  const { attestations } = await attest({ sessionId: session.sessionId, name: args.name })
  for (const link of args.pending) {
    if (!attestations.some((entry) => entry.platform === link.platform)) {
      throw new Error(`The attester returned no attestation for ${PLATFORM_LABELS[link.platform]}.`)
    }
  }
  return { sessionId: session.sessionId, entries: attestations }
}

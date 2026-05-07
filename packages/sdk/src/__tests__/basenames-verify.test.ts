import { http, type PublicClient, bytesToHex, createWalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getEnsAddressMock, getEnsTextMock, getOwnerMock } = vi.hoisted(() => ({
  getEnsAddressMock: vi.fn(),
  getEnsTextMock: vi.fn(),
  getOwnerMock: vi.fn(),
}))

vi.mock('viem/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem/actions')>()
  return {
    ...actual,
    getEnsAddress: getEnsAddressMock,
    getEnsText: getEnsTextMock,
  }
})

vi.mock('@ensdomains/ensjs/public', () => ({
  getOwner: getOwnerMock,
}))

import { encodeEnvelope, signHandleClaim, signUidClaim } from '../attestation'
import { BASE_REGISTRY } from '../internal'
import { attestationVerifier, handleAttestationRecordKey, uidAttestationRecordKey } from '../verify'

const ATTESTER_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const
const WALLET_PK = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as const

const ATTESTER_ADDR = privateKeyToAccount(ATTESTER_PK).address
const WALLET_ADDR = privateKeyToAccount(WALLET_PK).address

const L2_RESOLVER = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as `0x${string}`

function makeAttesterWallet() {
  return createWalletClient({
    account: privateKeyToAccount(ATTESTER_PK),
    chain: mainnet,
    transport: http('http://127.0.0.1:1/unused'),
  })
}

const ATTESTER_ENS = 'atst.lighthousegov.eth'

type ReadCall = {
  address: string
  functionName: string
  args: readonly unknown[]
}

function makeBaseClient(
  cfg: {
    resolver?: string
    owner?: string
    texts?: Record<string, string>
  } = {},
): { client: PublicClient; read: ReturnType<typeof vi.fn> } {
  const resolver = cfg.resolver ?? L2_RESOLVER
  const owner = cfg.owner ?? WALLET_ADDR
  const texts = cfg.texts ?? {}
  const read = vi.fn(async (call: ReadCall) => {
    if (call.address.toLowerCase() === BASE_REGISTRY) {
      if (call.functionName === 'resolver') return resolver
      if (call.functionName === 'owner') return owner
    }
    if (call.functionName === 'text') {
      const key = call.args[1] as string
      return texts[key] ?? ''
    }
    return ''
  })
  return { client: { readContract: read } as unknown as PublicClient, read }
}

const mainnetClient = {} as unknown as PublicClient

beforeEach(() => {
  getEnsAddressMock.mockReset()
  getEnsTextMock.mockReset()
  getOwnerMock.mockReset()
  // Attester ENS resolves to attester signing key on mainnet (default behaviour).
  getEnsAddressMock.mockResolvedValue(ATTESTER_ADDR)
})

describe('verifyHandleAttestation for *.base.eth', () => {
  it('returns valid for a correctly signed envelope when registry owner and L2 resolver are reachable', async () => {
    const name = 'foo.base.eth'
    const platform = 'com.x'
    const handle = 'satoshi'
    const envelope = await signHandleClaim(
      { platform, handle, name, addr: WALLET_ADDR },
      makeAttesterWallet(),
    )
    const envHex = bytesToHex(encodeEnvelope(envelope))
    const attestationKey = handleAttestationRecordKey(platform, ATTESTER_ENS)

    const { client: baseClient } = makeBaseClient({
      texts: { [attestationKey]: envHex, [platform]: handle },
    })

    const verifier = attestationVerifier({ basePublicClient: baseClient })(mainnetClient)
    const result = await verifier.verifyHandleAttestation({ name, platform })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.handle).toBe(handle)
      expect(result.attesterAddress?.toLowerCase()).toBe(ATTESTER_ADDR.toLowerCase())
    }
    expect(getOwnerMock).not.toHaveBeenCalled()
    expect(getEnsTextMock).not.toHaveBeenCalled()
  })

  it('returns owner-not-resolved when registry owner is the zero address', async () => {
    const name = 'orphan.base.eth'
    const platform = 'com.x'
    const handle = 'satoshi'
    const envelope = await signHandleClaim(
      { platform, handle, name, addr: WALLET_ADDR },
      makeAttesterWallet(),
    )
    const envHex = bytesToHex(encodeEnvelope(envelope))
    const attestationKey = handleAttestationRecordKey(platform, ATTESTER_ENS)

    const { client: baseClient } = makeBaseClient({
      owner: '0x0000000000000000000000000000000000000000',
      texts: { [attestationKey]: envHex, [platform]: handle },
    })

    const verifier = attestationVerifier({ basePublicClient: baseClient })(mainnetClient)
    const result = await verifier.verifyHandleAttestation({ name, platform })

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('owner-not-resolved')
    }
  })

  it('returns missing when the envelope text record is absent', async () => {
    const name = 'foo.base.eth'
    const platform = 'com.x'

    const { client: baseClient } = makeBaseClient({ texts: {} })

    const verifier = attestationVerifier({ basePublicClient: baseClient })(mainnetClient)
    const result = await verifier.verifyHandleAttestation({ name, platform })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('missing')
  })
})

describe('verifyUidAttestation for *.base.eth', () => {
  it('returns valid for a correctly signed uid envelope', async () => {
    const name = 'bar.base.eth'
    const platform = 'com.x'
    const uid = '1234567890'
    const envelope = await signUidClaim(
      { platform, uid, name, addr: WALLET_ADDR },
      makeAttesterWallet(),
    )
    const envHex = bytesToHex(encodeEnvelope(envelope))
    const attestationKey = uidAttestationRecordKey(platform, ATTESTER_ENS)

    const { client: baseClient } = makeBaseClient({
      texts: { [attestationKey]: envHex },
    })

    const verifier = attestationVerifier({ basePublicClient: baseClient })(mainnetClient)
    const result = await verifier.verifyUidAttestation({ name, platform, uid })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.uid).toBe(uid)
      expect(result.attesterAddress?.toLowerCase()).toBe(ATTESTER_ADDR.toLowerCase())
    }
    expect(getOwnerMock).not.toHaveBeenCalled()
  })

  it('returns owner-not-resolved when the registry returns zero owner', async () => {
    const name = 'bar.base.eth'
    const platform = 'com.x'
    const uid = 'abc'
    const envelope = await signUidClaim(
      { platform, uid, name, addr: WALLET_ADDR },
      makeAttesterWallet(),
    )
    const envHex = bytesToHex(encodeEnvelope(envelope))
    const attestationKey = uidAttestationRecordKey(platform, ATTESTER_ENS)

    const { client: baseClient } = makeBaseClient({
      owner: '0x0000000000000000000000000000000000000000',
      texts: { [attestationKey]: envHex },
    })

    const verifier = attestationVerifier({ basePublicClient: baseClient })(mainnetClient)
    const result = await verifier.verifyUidAttestation({ name, platform, uid })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('owner-not-resolved')
  })
})

describe('mainnet names continue to use ensjs getOwner / viem getEnsText', () => {
  it('verifyHandleAttestation for alice.eth never touches the Base mocks', async () => {
    const name = 'alice.eth'
    const platform = 'com.x'
    const handle = 'satoshi'
    const envelope = await signHandleClaim(
      { platform, handle, name, addr: WALLET_ADDR },
      makeAttesterWallet(),
    )
    const envHex = bytesToHex(encodeEnvelope(envelope))
    const attestationKey = handleAttestationRecordKey(platform, ATTESTER_ENS)

    getOwnerMock.mockResolvedValue({ owner: WALLET_ADDR, ownershipLevel: 'registrar' })
    getEnsTextMock.mockImplementation(async (_c: unknown, args: { key: string }) => {
      if (args.key === attestationKey) return envHex
      if (args.key === platform) return handle
      return null
    })

    const baseRead = vi.fn()
    const baseClient = { readContract: baseRead } as unknown as PublicClient

    const verifier = attestationVerifier({ basePublicClient: baseClient })(mainnetClient)
    const result = await verifier.verifyHandleAttestation({ name, platform })

    expect(result.valid).toBe(true)
    expect(getOwnerMock).toHaveBeenCalled()
    expect(getEnsTextMock).toHaveBeenCalled()
    expect(baseRead).not.toHaveBeenCalled()
  })
})

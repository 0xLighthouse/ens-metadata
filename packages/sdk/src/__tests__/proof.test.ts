import { http, createWalletClient, keccak256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  CLAIM_VERSION,
  ENVELOPE_TAG,
  decodeEnvelope,
  decodePayload,
  encodeEnvelope,
  encodePayload,
  signClaim,
  verifyClaim,
} from '../proof'
import type { Envelope, PayloadFields } from '../proof-types'

// Fixed test keys — not secret, never used outside tests.
const ATTESTER_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const
const WALLET_PRIVATE_KEY =
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as const
const STRANGER_PRIVATE_KEY =
  '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d' as const

const ATTESTER_ADDR = privateKeyToAccount(ATTESTER_PRIVATE_KEY).address
const WALLET_ADDR = privateKeyToAccount(WALLET_PRIVATE_KEY).address
const STRANGER_ADDR = privateKeyToAccount(STRANGER_PRIVATE_KEY).address

function makeInput(overrides: Partial<Parameters<typeof signClaim>[0]> = {}) {
  return {
    p: 'com.x',
    h: 'vitalik',
    uid: 'blinded-uid-abc123',
    name: 'alice.eth',
    chainId: 1,
    addr: WALLET_ADDR,
    exp: Math.floor(Date.now() / 1000) + 3600,
    prf: 'bafkreigh2akiscaildc6gjl5lxj3y5grqocqgjjylz57hxh2mzicvabcde',
    method: 'privy-linked',
    issuedAt: Math.floor(Date.now() / 1000),
    ...overrides,
  }
}

function makeWalletClient(pk: `0x${string}`) {
  return createWalletClient({
    account: privateKeyToAccount(pk),
    chain: mainnet,
    transport: http('http://127.0.0.1:1/unused'),
  })
}

const trusted = { trustedAttesters: [ATTESTER_ADDR] as const }
const trustedWithOwner = {
  trustedAttesters: [ATTESTER_ADDR] as const,
  expectedOwner: WALLET_ADDR,
}

describe('encodePayload / decodePayload — determinism', () => {
  it('round-trips byte-identically', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const decoded = decodePayload(envelope.payload)
    const reencoded = encodePayload(decoded)
    expect(Array.from(reencoded)).toEqual(Array.from(envelope.payload))
  })

  it('two independently constructed identical payloads produce identical bytes', () => {
    const fields: PayloadFields = {
      v: CLAIM_VERSION,
      p: 'com.x',
      uid: 'abc',
      name: 'alice.eth',
      chainId: 1,
      addr: WALLET_ADDR,
      att: ATTESTER_ADDR,
      exp: 1800000000,
      prf: 'bafk...',
    }
    const a = encodePayload(fields)
    const b = encodePayload({ ...fields })
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('rejects unknown schema versions', () => {
    expect(() =>
      encodePayload({
        v: 99,
        p: 'com.x',
        uid: 'x',
        name: 'x.eth',
        chainId: 1,
        addr: WALLET_ADDR,
        att: ATTESTER_ADDR,
        exp: 9999999999,
        prf: '',
      }),
    ).toThrow(/unsupported version/)
  })
})

describe('encodeEnvelope / decodeEnvelope — round-trip', () => {
  it('round-trips a signed envelope', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const bytes = encodeEnvelope(envelope)
    const decoded = decodeEnvelope(bytes)
    expect(decoded.v).toBe(envelope.v)
    expect(decoded.p).toBe(envelope.p)
    expect(decoded.h).toBe(envelope.h)
    expect(decoded.method).toBe(envelope.method)
    expect(decoded.issuedAt).toBe(envelope.issuedAt)
    expect(decoded.sig).toBe(envelope.sig)
    expect(Array.from(decoded.payload)).toEqual(Array.from(envelope.payload))
  })

  it('first byte is 0xDB (CBOR tag header)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const bytes = encodeEnvelope(envelope)
    expect(bytes[0]).toBe(0xdb)
  })
})

describe('signClaim / verifyClaim — happy path', () => {
  it('signs and verifies a v3 envelope', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    expect(envelope.sig).toMatch(/^0x[0-9a-f]{130}$/)
    expect(envelope.att).toBe(undefined) // att is inside payload, not on envelope
    expect(envelope.v).toBe(CLAIM_VERSION)
    expect(envelope.h).toBe('vitalik')
    expect(envelope.method).toBe('privy-linked')

    const result = await verifyClaim(envelope, trustedWithOwner)
    expect(result.valid).toBe(true)
    expect(result.recovered?.toLowerCase()).toBe(ATTESTER_ADDR.toLowerCase())
  })

  it('signed envelope round-trips through CBOR without losing validity', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const bytes = encodeEnvelope(envelope)
    const decoded = decodeEnvelope(bytes)
    const result = await verifyClaim(decoded, trustedWithOwner)
    expect(result.valid).toBe(true)
  })

  it('verifies without expectedOwner (skips staleness check)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const result = await verifyClaim(envelope, trusted)
    expect(result.valid).toBe(true)
  })
})

describe('signClaim — att binding', () => {
  it('auto-populates att in the inner payload from the attester wallet', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const inner = decodePayload(envelope.payload)
    expect(inner.att).toBe(ATTESTER_ADDR)
  })

  it('throws when the pre-populated att does not match the attester wallet', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    await expect(signClaim(makeInput({ att: STRANGER_ADDR }), attester)).rejects.toThrow(
      /does not match attester wallet/,
    )
  })
})

describe('verifyClaim — tamper detection (signed fields)', () => {
  it('rejects a tampered uid', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    // Tamper: re-encode the payload with a different uid
    const inner = decodePayload(envelope.payload)
    const tampered: Envelope = {
      ...envelope,
      payload: encodePayload({ ...inner, uid: 'different' }),
    }
    const result = await verifyClaim(tampered, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a tampered name (replay protection)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const inner = decodePayload(envelope.payload)
    const tampered: Envelope = {
      ...envelope,
      payload: encodePayload({ ...inner, name: 'bob.eth' }),
    }
    const result = await verifyClaim(tampered, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a tampered chainId (replay protection)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const inner = decodePayload(envelope.payload)
    const tampered: Envelope = {
      ...envelope,
      payload: encodePayload({ ...inner, chainId: 11155111 }),
    }
    const result = await verifyClaim(tampered, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a tampered platform (replay protection)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const inner = decodePayload(envelope.payload)
    const tampered: Envelope = {
      ...envelope,
      payload: encodePayload({ ...inner, p: 'org.telegram' }),
    }
    const result = await verifyClaim(tampered, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })
})

describe('verifyClaim — unsigned fields are NOT signed', () => {
  it('changing handle does NOT invalidate the signature', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const modified: Envelope = { ...envelope, h: 'differenthandle' }
    const result = await verifyClaim(modified, trustedWithOwner)
    expect(result.valid).toBe(true)
  })

  it('changing method does NOT invalidate the signature', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const modified: Envelope = { ...envelope, method: 'tlsnotary' }
    const result = await verifyClaim(modified, trustedWithOwner)
    expect(result.valid).toBe(true)
  })

  it('changing issuedAt does NOT invalidate the signature', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const modified: Envelope = { ...envelope, issuedAt: 0 }
    const result = await verifyClaim(modified, trustedWithOwner)
    expect(result.valid).toBe(true)
  })
})

describe('verifyClaim — trust and staleness', () => {
  it('rejects a valid signature from an untrusted attester', async () => {
    const stranger = makeWalletClient(STRANGER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput({ att: STRANGER_ADDR }), stranger)
    const result = await verifyClaim(envelope, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('untrusted-attester')
  })

  it('rejects a valid claim whose observed addr is no longer the ENS owner', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const result = await verifyClaim(envelope, {
      ...trusted,
      expectedOwner: STRANGER_ADDR,
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('wrong-owner')
  })

  it('rejects an expired claim', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(
      makeInput({ exp: Math.floor(Date.now() / 1000) - 10 }),
      attester,
    )
    const result = await verifyClaim(envelope, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('expired')
  })
})

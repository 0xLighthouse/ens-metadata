import { decode as dagCborDecode } from '@ipld/dag-cbor'
import { http, createWalletClient, keccak256, toBytes } from 'viem'
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

/** Generate a realistic blinded uid (65-byte EIP-191 signature). */
async function blindUid(platform: string, rawUid: string) {
  const wallet = makeWalletClient(ATTESTER_PRIVATE_KEY)
  const hash = keccak256(toBytes(`${platform}:${rawUid}`))
  return wallet.signMessage({
    account: privateKeyToAccount(ATTESTER_PRIVATE_KEY),
    message: { raw: hash },
  })
}

function makeInput(overrides: Partial<Parameters<typeof signClaim>[0]> = {}) {
  return {
    platform: 'com.x',
    handle: 'vitalik',
    uid: `0x${'ab'.repeat(65)}` as `0x${string}`,
    name: 'alice.eth',
    addr: WALLET_ADDR,
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
      platform: 'com.x',
      handle: 'vitalik',
      uid: `0x${'ab'.repeat(65)}` as `0x${string}`,
      name: 'alice.eth',
      issuedAt: 1800000000,
      addr: WALLET_ADDR,
    }
    const a = encodePayload(fields)
    const b = encodePayload({ ...fields })
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})

describe('encodePayload / decodePayload — binary encoding', () => {
  it('uid is encoded as 65 raw bytes, not a hex string', () => {
    const fields: PayloadFields = {
      platform: 'com.x',
      handle: 'test',
      uid: `0x${'ab'.repeat(65)}` as `0x${string}`,
      name: 'test.eth',
      issuedAt: 1000000,
      addr: WALLET_ADDR,
    }
    const bytes = encodePayload(fields)
    const raw = dagCborDecode(bytes) as Record<string, unknown>
    expect(raw.u).toBeInstanceOf(Uint8Array)
    expect((raw.u as Uint8Array).length).toBe(65)
  })

  it('addr is encoded as 20 raw bytes (key "a"), not a string', () => {
    const fields: PayloadFields = {
      platform: 'com.x',
      handle: 'test',
      uid: `0x${'ab'.repeat(65)}` as `0x${string}`,
      name: 'test.eth',
      issuedAt: 1000000,
      addr: WALLET_ADDR,
    }
    const bytes = encodePayload(fields)
    const raw = dagCborDecode(bytes) as Record<string, unknown>
    expect(raw.a).toBeInstanceOf(Uint8Array)
    expect((raw.a as Uint8Array).length).toBe(20)
  })
})

describe('encodeEnvelope / decodeEnvelope — round-trip', () => {
  it('round-trips a signed envelope', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const bytes = encodeEnvelope(envelope)
    const decoded = decodeEnvelope(bytes)
    expect(decoded.version).toBe(envelope.version)
    expect(decoded.attester).toBe(envelope.attester)
    expect(decoded.sig).toBe(envelope.sig)
    expect(Array.from(decoded.payload)).toEqual(Array.from(envelope.payload))
  })

  it('first byte is 0xDA (CBOR tag header, 4-byte value)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const bytes = encodeEnvelope(envelope)
    expect(bytes[0]).toBe(0xda)
  })

  it('attester is encoded as 20 raw bytes (key "a") in CBOR', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const bytes = encodeEnvelope(envelope)
    const { decode } = await import('cborg')
    const raw = decode(bytes, {
      // biome-ignore lint/suspicious/noExplicitAny: cborg's TagDecodeControl type isn't exported
      tags: { [ENVELOPE_TAG]: (d: any) => d() },
    }) as Record<string, unknown>
    expect(raw.a).toBeInstanceOf(Uint8Array)
    expect((raw.a as Uint8Array).length).toBe(20)
  })
})

describe('signClaim / verifyClaim — happy path', () => {
  it('signs and verifies a v4 envelope', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    expect(envelope.sig).toMatch(/^0x[0-9a-f]{130}$/)
    expect(envelope.version).toBe(CLAIM_VERSION)
    expect(envelope.attester).toBe(ATTESTER_ADDR)

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

  it('verifies without expectedOwner (skips owner check)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const result = await verifyClaim(envelope, trusted)
    expect(result.valid).toBe(true)
  })
})

describe('signClaim — attester binding', () => {
  it('auto-populates attester from the wallet account', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    expect(envelope.attester).toBe(ATTESTER_ADDR)
  })

  it('issuedAt is auto-computed as current unix time', async () => {
    const before = Math.floor(Date.now() / 1000)
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const after = Math.floor(Date.now() / 1000)
    const inner = decodePayload(envelope.payload)
    expect(inner.issuedAt).toBeGreaterThanOrEqual(before)
    expect(inner.issuedAt).toBeLessThanOrEqual(after)
  })
})

describe('verifyClaim — tamper detection (signed fields)', () => {
  it('rejects a tampered uid', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const inner = decodePayload(envelope.payload)
    const tampered: Envelope = {
      ...envelope,
      payload: encodePayload({ ...inner, uid: `0x${'cd'.repeat(65)}` as `0x${string}` }),
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

  it('rejects a tampered platform (replay protection)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const inner = decodePayload(envelope.payload)
    const tampered: Envelope = {
      ...envelope,
      payload: encodePayload({ ...inner, platform: 'org.telegram' }),
    }
    const result = await verifyClaim(tampered, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a tampered handle', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const inner = decodePayload(envelope.payload)
    const tampered: Envelope = {
      ...envelope,
      payload: encodePayload({ ...inner, handle: 'impersonator' }),
    }
    const result = await verifyClaim(tampered, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a tampered issuedAt', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const inner = decodePayload(envelope.payload)
    const tampered: Envelope = {
      ...envelope,
      payload: encodePayload({ ...inner, issuedAt: 0 }),
    }
    const result = await verifyClaim(tampered, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })
})

describe('verifyClaim — freshness (maxAge)', () => {
  it('rejects a stale claim when maxAge is set', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const inner = decodePayload(envelope.payload)
    const stalePayload = encodePayload({ ...inner, issuedAt: Math.floor(Date.now() / 1000) - 7200 })
    const hash = keccak256(stalePayload)
    const sig = await attester.signMessage({
      account: privateKeyToAccount(ATTESTER_PRIVATE_KEY),
      message: { raw: hash },
    })
    const staleEnvelope: Envelope = { ...envelope, payload: stalePayload, sig }
    const result = await verifyClaim(staleEnvelope, { ...trustedWithOwner, maxAge: 3600 })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('stale')
  })

  it('accepts a fresh claim when maxAge is set', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const result = await verifyClaim(envelope, { ...trustedWithOwner, maxAge: 3600 })
    expect(result.valid).toBe(true)
  })

  it('skips freshness check when maxAge is not set', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), attester)
    const inner = decodePayload(envelope.payload)
    const oldPayload = encodePayload({ ...inner, issuedAt: 1000000000 })
    const hash = keccak256(oldPayload)
    const sig = await attester.signMessage({
      account: privateKeyToAccount(ATTESTER_PRIVATE_KEY),
      message: { raw: hash },
    })
    const oldEnvelope: Envelope = { ...envelope, payload: oldPayload, sig }
    const result = await verifyClaim(oldEnvelope, trustedWithOwner)
    expect(result.valid).toBe(true)
  })
})

describe('verifyClaim — trust and ownership', () => {
  it('rejects a valid signature from an untrusted attester', async () => {
    const stranger = makeWalletClient(STRANGER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput(), stranger)
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
})

describe('verifyClaim — uid binding via ecrecover', () => {
  it('uid field recovers to the attester address', async () => {
    const blinded = await blindUid('com.x', '123456789')
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signClaim(makeInput({ uid: blinded }), attester)
    const inner = decodePayload(envelope.payload)

    const { recoverMessageAddress } = await import('viem')
    const hash = keccak256(toBytes('com.x:123456789'))
    const recovered = await recoverMessageAddress({
      message: { raw: hash },
      signature: inner.uid,
    })
    expect(recovered.toLowerCase()).toBe(ATTESTER_ADDR.toLowerCase())
  })
})

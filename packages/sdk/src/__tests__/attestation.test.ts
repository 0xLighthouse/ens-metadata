import { decode as dagCborDecode } from '@ipld/dag-cbor'
import { http, createWalletClient, keccak256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  CLAIM_VERSION,
  ENVELOPE_TAG,
  decodeEnvelope,
  encodeEnvelope,
  encodeHandlePayload,
  encodeUidPayload,
  signHandleClaim,
  signUidClaim,
  verifyHandleClaim,
  verifyUidClaim,
} from '../attestation'
import type { Envelope, HandlePayloadFields, UidPayloadFields } from '../attestation-types'

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

function makeWalletClient(pk: `0x${string}`) {
  return createWalletClient({
    account: privateKeyToAccount(pk),
    chain: mainnet,
    transport: http('http://127.0.0.1:1/unused'),
  })
}

function makeHandleInput(overrides: Partial<Parameters<typeof signHandleClaim>[0]> = {}) {
  return {
    platform: 'com.x',
    handle: 'vitalik',
    name: 'alice.eth',
    addr: WALLET_ADDR,
    ...overrides,
  }
}

function makeUidInput(overrides: Partial<Parameters<typeof signUidClaim>[0]> = {}) {
  return {
    platform: 'com.x',
    uid: '1234567890',
    name: 'alice.eth',
    addr: WALLET_ADDR,
    ...overrides,
  }
}

// ------------------------------------------------------------------
// Payload encoding
// ------------------------------------------------------------------

describe('encodeHandlePayload — determinism & binary encoding', () => {
  const fields: HandlePayloadFields = {
    platform: 'com.x',
    handle: 'vitalik',
    name: 'alice.eth',
    issuedAt: 1800000000,
    addr: WALLET_ADDR,
  }

  it('two identical payloads produce identical bytes', () => {
    const a = encodeHandlePayload(fields)
    const b = encodeHandlePayload({ ...fields })
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('addr is encoded as 20 raw bytes under key "a"', () => {
    const raw = dagCborDecode(encodeHandlePayload(fields)) as Record<string, unknown>
    expect(raw.a).toBeInstanceOf(Uint8Array)
    expect((raw.a as Uint8Array).length).toBe(20)
  })

  it('uses single-char keys n, a, p, h, t and no others', () => {
    const raw = dagCborDecode(encodeHandlePayload(fields)) as Record<string, unknown>
    expect(new Set(Object.keys(raw))).toEqual(new Set(['n', 'a', 'p', 'h', 't']))
  })

  it('handle goes into h, not u', () => {
    const raw = dagCborDecode(encodeHandlePayload(fields)) as Record<string, unknown>
    expect(raw.h).toBe('vitalik')
    expect(raw.u).toBeUndefined()
  })
})

describe('encodeUidPayload — determinism & binary encoding', () => {
  const fields: UidPayloadFields = {
    platform: 'com.x',
    uid: '1234567890',
    name: 'alice.eth',
    issuedAt: 1800000000,
    addr: WALLET_ADDR,
  }

  it('two identical payloads produce identical bytes', () => {
    const a = encodeUidPayload(fields)
    const b = encodeUidPayload({ ...fields })
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('uid is encoded as a plain string under key "u", not bytes', () => {
    const raw = dagCborDecode(encodeUidPayload(fields)) as Record<string, unknown>
    expect(typeof raw.u).toBe('string')
    expect(raw.u).toBe('1234567890')
  })

  it('uses single-char keys n, a, p, u, t and no others', () => {
    const raw = dagCborDecode(encodeUidPayload(fields)) as Record<string, unknown>
    expect(new Set(Object.keys(raw))).toEqual(new Set(['n', 'a', 'p', 'u', 't']))
  })

  it('handle-only and uid-only payloads with same shared fields produce different bytes', () => {
    const handleBytes = encodeHandlePayload({
      platform: 'com.x',
      handle: 'vitalik',
      name: 'alice.eth',
      issuedAt: 1800000000,
      addr: WALLET_ADDR,
    })
    const uidBytes = encodeUidPayload(fields)
    expect(Array.from(handleBytes)).not.toEqual(Array.from(uidBytes))
  })
})

// ------------------------------------------------------------------
// Envelope encoding
// ------------------------------------------------------------------

describe('encodeEnvelope / decodeEnvelope — v2 shape', () => {
  it('first byte is 0xDA (CBOR tag header, 4-byte value)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), attester)
    const bytes = encodeEnvelope(envelope)
    expect(bytes[0]).toBe(0xda)
  })

  it('envelope is a 3-element CBOR array [version, timestamp, sig]', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), attester)
    const bytes = encodeEnvelope(envelope)
    const { decode } = await import('cborg')
    const raw = decode(bytes, {
      // biome-ignore lint/suspicious/noExplicitAny: cborg's TagDecodeControl type isn't exported
      tags: { [ENVELOPE_TAG]: (d: any) => d() },
    }) as unknown[]
    expect(Array.isArray(raw)).toBe(true)
    expect(raw.length).toBe(3)
    expect(raw[0]).toBe(2)
    expect(typeof raw[1]).toBe('number')
    expect(raw[2]).toBeInstanceOf(Uint8Array)
    expect((raw[2] as Uint8Array).length).toBe(65)
  })

  it('round-trips', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), attester)
    const decoded = decodeEnvelope(encodeEnvelope(envelope))
    expect(decoded.version).toBe(envelope.version)
    expect(decoded.issuedAt).toBe(envelope.issuedAt)
    expect(decoded.sig).toBe(envelope.sig)
  })

  it('rejects non-v2 envelopes', async () => {
    const { encode, Tagged } = await import('cborg')
    const bytes = encode(new Tagged(ENVELOPE_TAG, [1, 1800000000, new Uint8Array(65)]))
    expect(() => decodeEnvelope(bytes)).toThrow()
  })

  it('rejects an envelope missing the atst tag prefix', async () => {
    const { encode } = await import('cborg')
    const bytes = encode([2, 1800000000, new Uint8Array(65)])
    expect(() => decodeEnvelope(bytes)).toThrow()
  })
})

// ------------------------------------------------------------------
// Handle claim: sign + verify
// ------------------------------------------------------------------

describe('signHandleClaim / verifyHandleClaim — happy path', () => {
  it('signs and verifies a handle envelope', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), attester)
    expect(envelope.sig).toMatch(/^0x[0-9a-f]{130}$/)
    expect(envelope.version).toBe(CLAIM_VERSION)

    const result = await verifyHandleClaim(envelope, {
      trustedAttester: ATTESTER_ADDR,
      owner: WALLET_ADDR,
      name: 'alice.eth',
      platform: 'com.x',
      handle: 'vitalik',
    })
    expect(result.valid).toBe(true)
    expect(result.recovered?.toLowerCase()).toBe(ATTESTER_ADDR.toLowerCase())
  })

  it('round-trips through CBOR without losing validity', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), attester)
    const decoded = decodeEnvelope(encodeEnvelope(envelope))
    const result = await verifyHandleClaim(decoded, {
      trustedAttester: ATTESTER_ADDR,
      owner: WALLET_ADDR,
      name: 'alice.eth',
      platform: 'com.x',
      handle: 'vitalik',
    })
    expect(result.valid).toBe(true)
  })

  it('auto-populates issuedAt (current unix time)', async () => {
    const before = Math.floor(Date.now() / 1000)
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), attester)
    const after = Math.floor(Date.now() / 1000)
    expect(envelope.issuedAt).toBeGreaterThanOrEqual(before)
    expect(envelope.issuedAt).toBeLessThanOrEqual(after)
  })
})

describe('verifyHandleClaim — reconstructed-input tamper detection', () => {
  const base = {
    trustedAttester: ATTESTER_ADDR,
    owner: WALLET_ADDR,
    name: 'alice.eth',
    platform: 'com.x',
    handle: 'vitalik',
  }

  it('rejects a wrong reconstructed handle', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), attester)
    const result = await verifyHandleClaim(envelope, { ...base, handle: 'impersonator' })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a wrong reconstructed name', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), attester)
    const result = await verifyHandleClaim(envelope, { ...base, name: 'bob.eth' })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a wrong reconstructed platform', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), attester)
    const result = await verifyHandleClaim(envelope, { ...base, platform: 'org.telegram' })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a wrong reconstructed owner', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), attester)
    const result = await verifyHandleClaim(envelope, { ...base, owner: STRANGER_ADDR })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a tampered envelope timestamp', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), attester)
    const tampered: Envelope = { ...envelope, issuedAt: envelope.issuedAt + 100 }
    const result = await verifyHandleClaim(tampered, base)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })
})

describe('verifyHandleClaim — trust & freshness', () => {
  const base = {
    trustedAttester: ATTESTER_ADDR,
    owner: WALLET_ADDR,
    name: 'alice.eth',
    platform: 'com.x',
    handle: 'vitalik',
  }

  it('rejects a signature from an untrusted attester', async () => {
    const stranger = makeWalletClient(STRANGER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), stranger)
    const result = await verifyHandleClaim(envelope, base)
    expect(result.valid).toBe(false)
    // Recovered is the stranger, not the trusted attester.
    expect(result.reason).toBe('bad-signature')
    expect(result.recovered?.toLowerCase()).toBe(STRANGER_ADDR.toLowerCase())
  })

  it('rejects a stale claim when maxAge is set', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const stale = Math.floor(Date.now() / 1000) - 7200
    const fields: HandlePayloadFields = {
      platform: 'com.x',
      handle: 'vitalik',
      name: 'alice.eth',
      issuedAt: stale,
      addr: WALLET_ADDR,
    }
    const hash = keccak256(encodeHandlePayload(fields))
    const sig = await attester.signMessage({
      account: privateKeyToAccount(ATTESTER_PRIVATE_KEY),
      message: { raw: hash },
    })
    const envelope: Envelope = { version: CLAIM_VERSION, issuedAt: stale, sig }
    const result = await verifyHandleClaim(envelope, { ...base, maxAge: 3600 })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('stale')
  })

  it('accepts a fresh claim when maxAge is set', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signHandleClaim(makeHandleInput(), attester)
    const result = await verifyHandleClaim(envelope, { ...base, maxAge: 3600 })
    expect(result.valid).toBe(true)
  })
})

// ------------------------------------------------------------------
// UID claim: sign + verify
// ------------------------------------------------------------------

describe('signUidClaim / verifyUidClaim', () => {
  const base = {
    trustedAttester: ATTESTER_ADDR,
    owner: WALLET_ADDR,
    name: 'alice.eth',
    platform: 'com.x',
    uid: '1234567890',
  }

  it('signs and verifies a uid envelope', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signUidClaim(makeUidInput(), attester)
    expect(envelope.version).toBe(CLAIM_VERSION)
    expect(envelope.sig).toMatch(/^0x[0-9a-f]{130}$/)

    const result = await verifyUidClaim(envelope, base)
    expect(result.valid).toBe(true)
  })

  it('rejects a wrong uid (the raw uid is load-bearing)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signUidClaim(makeUidInput(), attester)
    const result = await verifyUidClaim(envelope, { ...base, uid: '9999999999' })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('a handle envelope cannot be re-interpreted as a uid envelope', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const handleEnv = await signHandleClaim(makeHandleInput(), attester)
    const result = await verifyUidClaim(handleEnv, { ...base, uid: 'vitalik' })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects from an untrusted attester', async () => {
    const stranger = makeWalletClient(STRANGER_PRIVATE_KEY)
    const envelope = await signUidClaim(makeUidInput(), stranger)
    const result = await verifyUidClaim(envelope, base)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a wrong reconstructed owner', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const envelope = await signUidClaim(makeUidInput(), attester)
    const result = await verifyUidClaim(envelope, { ...base, owner: STRANGER_ADDR })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })
})

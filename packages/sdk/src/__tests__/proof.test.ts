import { http, createWalletClient, keccak256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { decodeClaim, encodeClaim, hashClaim, signClaim, verifyClaim } from '../proof'
import type { Claim, ClaimWithoutSig } from '../proof-types'

// Fixed test key — not secret, never used outside tests.
const TEST_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const
const OTHER_PRIVATE_KEY =
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as const

function makeClaim(overrides: Partial<ClaimWithoutSig> = {}): ClaimWithoutSig {
  return {
    v: 1,
    p: 'twitter',
    h: 'vitalik',
    uid: '295218901',
    exp: Math.floor(Date.now() / 1000) + 3600,
    prf: 'bafkreigh2akiscaildc6gjl5lxj3y5grqocqgjjylz57hxh2mzicvabcde',
    name: 'alice.eth',
    chainId: 1,
    ...overrides,
  }
}

function makeWalletClient(pk: `0x${string}`) {
  const account = privateKeyToAccount(pk)
  return createWalletClient({
    account,
    chain: mainnet,
    transport: http('http://127.0.0.1:1/unused'),
  })
}

describe('encodeClaim / decodeClaim — determinism', () => {
  it('round-trips byte-identically', () => {
    const claim = makeClaim()
    const encoded = encodeClaim(claim)
    const decoded = decodeClaim(encoded)
    const reencoded = encodeClaim({ ...(decoded as ClaimWithoutSig) })
    expect(Array.from(reencoded)).toEqual(Array.from(encoded))
  })

  it('two independently constructed identical claims produce identical bytes', () => {
    const a = encodeClaim(makeClaim())
    const b = encodeClaim(makeClaim())
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('field order in the source object does not affect output bytes', () => {
    const base = makeClaim()
    // Spread in a different enumeration order; dag-cbor should canonicalize.
    const shuffled: ClaimWithoutSig = {
      chainId: base.chainId,
      name: base.name,
      prf: base.prf,
      exp: base.exp,
      uid: base.uid,
      h: base.h,
      p: base.p,
      v: base.v,
    }
    expect(Array.from(encodeClaim(shuffled))).toEqual(Array.from(encodeClaim(base)))
  })

  it('decode rejects bytes that claim to be a claim but are missing fields', () => {
    // A trivial CBOR map missing most fields.
    // { "v": 1 } → 0xa16176 01 ... use dag-cbor to build it.
    const partial = new Uint8Array([0xa1, 0x61, 0x76, 0x01])
    expect(() => decodeClaim(partial)).toThrow()
  })

  it('hashClaim is stable across repeated calls', () => {
    const c = makeClaim()
    expect(hashClaim(c)).toBe(hashClaim(c))
  })

  it('hashClaim equals keccak256 of canonical cbor of claim without sig', () => {
    const c = makeClaim()
    expect(hashClaim(c)).toBe(keccak256(encodeClaim(c)))
  })
})

describe('signClaim / verifyClaim — happy path', () => {
  it('signs and verifies a claim', async () => {
    const wallet = makeWalletClient(TEST_PRIVATE_KEY)
    const signed = await signClaim(makeClaim(), wallet)
    expect(signed.sig).toMatch(/^0x[0-9a-f]{130}$/)
    const result = await verifyClaim(signed, wallet.account.address)
    expect(result.valid).toBe(true)
  })

  it('signed claim round-trips through CBOR without losing validity', async () => {
    const wallet = makeWalletClient(TEST_PRIVATE_KEY)
    const signed = await signClaim(makeClaim(), wallet)
    const bytes = encodeClaim(signed)
    const decoded = decodeClaim(bytes) as Claim
    expect(decoded.sig).toBe(signed.sig)
    const result = await verifyClaim(decoded, wallet.account.address)
    expect(result.valid).toBe(true)
  })
})

describe('verifyClaim — tamper detection', () => {
  it('rejects a claim whose handle was modified after signing', async () => {
    const wallet = makeWalletClient(TEST_PRIVATE_KEY)
    const signed = await signClaim(makeClaim(), wallet)
    const tampered: Claim = { ...signed, h: 'eviltwin' }
    const result = await verifyClaim(tampered, wallet.account.address)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('wrong-owner')
  })

  it('rejects a claim whose ENS name was changed (replay protection)', async () => {
    const wallet = makeWalletClient(TEST_PRIVATE_KEY)
    const signed = await signClaim(makeClaim({ name: 'alice.eth' }), wallet)
    const replayed: Claim = { ...signed, name: 'bob.eth' }
    const result = await verifyClaim(replayed, wallet.account.address)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('wrong-owner')
  })

  it('rejects a claim whose chainId was changed (replay protection)', async () => {
    const wallet = makeWalletClient(TEST_PRIVATE_KEY)
    const signed = await signClaim(makeClaim({ chainId: 1 }), wallet)
    const replayed: Claim = { ...signed, chainId: 11155111 }
    const result = await verifyClaim(replayed, wallet.account.address)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('wrong-owner')
  })

  it('rejects a claim signed by A when verifying against B', async () => {
    const walletA = makeWalletClient(TEST_PRIVATE_KEY)
    const walletB = makeWalletClient(OTHER_PRIVATE_KEY)
    const signed = await signClaim(makeClaim(), walletA)
    const result = await verifyClaim(signed, walletB.account.address)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('wrong-owner')
  })

  it('rejects an expired claim', async () => {
    const wallet = makeWalletClient(TEST_PRIVATE_KEY)
    const signed = await signClaim(makeClaim({ exp: Math.floor(Date.now() / 1000) - 10 }), wallet)
    const result = await verifyClaim(signed, wallet.account.address)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('expired')
  })

  it('rejects a claim whose "h" field was modified after signing', async () => {
    // Duplicate of the handle-tamper test at a different call site — covered
    // by the generic "wrong-owner" check since any field change produces a
    // different hash, which recovers a different address.
    const wallet = makeWalletClient(TEST_PRIVATE_KEY)
    const signed = await signClaim(makeClaim(), wallet)
    const bytes = encodeClaim(signed)
    // Mutating bytes directly is detectable too — decode should either throw
    // or produce a claim whose signature no longer recovers the signer.
    const mutated = new Uint8Array(bytes)
    // Flip a low bit inside the handle field bytes. The handle "vitalik"
    // appears as an ASCII run; finding and flipping it is safer than a
    // random position because random positions may break CBOR framing.
    const needle = new TextEncoder().encode('vitalik')
    let idx = -1
    outer: for (let i = 0; i < mutated.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (mutated[i + j] !== needle[j]) continue outer
      }
      idx = i
      break
    }
    expect(idx).toBeGreaterThanOrEqual(0)
    mutated[idx] ^= 0x01
    const tampered = decodeClaim(mutated) as Claim
    const result = await verifyClaim(tampered, wallet.account.address)
    expect(result.valid).toBe(false)
  })
})

describe('replay scenario — alice.eth claim cannot be used for bob.eth', () => {
  it('is the whole point of putting name in the hash', async () => {
    const wallet = makeWalletClient(TEST_PRIVATE_KEY)
    const aliceClaim = await signClaim(makeClaim({ name: 'alice.eth' }), wallet)

    // Attacker copies the signed claim, swaps in bob.eth, tries to present
    // it as a bob.eth proof. Verifier re-hashes with name="bob.eth" and
    // recovers a different address — rejected.
    const replayed: Claim = { ...aliceClaim, name: 'bob.eth' }
    const result = await verifyClaim(replayed, wallet.account.address)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('wrong-owner')
  })
})

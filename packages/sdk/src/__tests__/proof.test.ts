import { http, createWalletClient, keccak256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { CLAIM_VERSION, decodeClaim, encodeClaim, hashClaim, signClaim, verifyClaim } from '../proof'
import type { Claim, ClaimWithoutSig } from '../proof-types'

// Fixed test keys — not secret, never used outside tests.
// ATTESTER is the backend signing key. WALLET is the user's wallet observed
// via SIWE. Treating them as distinct in tests keeps the v2 semantic split
// honest — they are never the same key in production.
const ATTESTER_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const
const WALLET_PRIVATE_KEY =
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as const
const STRANGER_PRIVATE_KEY =
  '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d' as const

const ATTESTER_ADDR = privateKeyToAccount(ATTESTER_PRIVATE_KEY).address
const WALLET_ADDR = privateKeyToAccount(WALLET_PRIVATE_KEY).address
const STRANGER_ADDR = privateKeyToAccount(STRANGER_PRIVATE_KEY).address

function makeClaim(overrides: Partial<ClaimWithoutSig> = {}): ClaimWithoutSig {
  return {
    v: CLAIM_VERSION,
    p: 'twitter',
    h: 'vitalik',
    uid: '295218901',
    exp: Math.floor(Date.now() / 1000) + 3600,
    prf: 'bafkreigh2akiscaildc6gjl5lxj3y5grqocqgjjylz57hxh2mzicvabcde',
    name: 'alice.eth',
    chainId: 1,
    addr: WALLET_ADDR,
    att: ATTESTER_ADDR,
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

const trusted = { trustedAttesters: [ATTESTER_ADDR] as const }
const trustedWithOwner = {
  trustedAttesters: [ATTESTER_ADDR] as const,
  expectedOwner: WALLET_ADDR,
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
      att: base.att,
      addr: base.addr,
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
    const partial = new Uint8Array([0xa1, 0x61, 0x76, 0x02])
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

  it('rejects unknown schema versions', () => {
    expect(() => encodeClaim(makeClaim({ v: 1 }))).toThrow(/unsupported version/)
    expect(() => encodeClaim(makeClaim({ v: 99 }))).toThrow(/unsupported version/)
  })
})

describe('signClaim / verifyClaim — happy path', () => {
  it('signs as attester and verifies against trusted set + expected owner', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const signed = await signClaim(makeClaim(), attester)
    expect(signed.sig).toMatch(/^0x[0-9a-f]{130}$/)
    expect(signed.att).toBe(ATTESTER_ADDR)
    expect(signed.addr).toBe(WALLET_ADDR)

    const result = await verifyClaim(signed, trustedWithOwner)
    expect(result.valid).toBe(true)
    expect(result.recovered?.toLowerCase()).toBe(ATTESTER_ADDR.toLowerCase())
  })

  it('signed claim round-trips through CBOR without losing validity', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const signed = await signClaim(makeClaim(), attester)
    const bytes = encodeClaim(signed)
    const decoded = decodeClaim(bytes) as Claim
    expect(decoded.sig).toBe(signed.sig)
    const result = await verifyClaim(decoded, trustedWithOwner)
    expect(result.valid).toBe(true)
  })

  it('verifies without expectedOwner (skips staleness check)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const signed = await signClaim(makeClaim(), attester)
    const result = await verifyClaim(signed, trusted)
    expect(result.valid).toBe(true)
  })
})

describe('signClaim — att binding', () => {
  it('auto-populates att from the attester wallet when omitted', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const { att: _drop, ...withoutAtt } = makeClaim()
    const signed = await signClaim(withoutAtt, attester)
    expect(signed.att).toBe(ATTESTER_ADDR)
  })

  it('accepts a pre-populated att that matches the attester wallet', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const signed = await signClaim(makeClaim({ att: ATTESTER_ADDR }), attester)
    const result = await verifyClaim(signed, trustedWithOwner)
    expect(result.valid).toBe(true)
  })

  it('throws when the pre-populated att does not match the attester wallet', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    await expect(signClaim(makeClaim({ att: STRANGER_ADDR }), attester)).rejects.toThrow(
      /does not match attester wallet/,
    )
  })

  it('does NOT auto-populate addr — caller must supply it explicitly', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    // @ts-expect-error addr is required at the type level; runtime check too.
    await expect(signClaim({ ...makeClaim(), addr: undefined }, attester)).rejects.toThrow(
      /missing required field "addr"/,
    )
  })
})

describe('verifyClaim — tamper detection', () => {
  it('rejects a claim whose handle was modified after signing', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const signed = await signClaim(makeClaim(), attester)
    const tampered: Claim = { ...signed, h: 'eviltwin' }
    const result = await verifyClaim(tampered, trustedWithOwner)
    expect(result.valid).toBe(false)
    // Mutating any signed field re-hashes to a different value, so ecrecover
    // yields an address that no longer matches claim.att — bad-signature.
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a claim whose ENS name was changed (replay protection)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const signed = await signClaim(makeClaim({ name: 'alice.eth' }), attester)
    const replayed: Claim = { ...signed, name: 'bob.eth' }
    const result = await verifyClaim(replayed, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a claim whose chainId was changed (replay protection)', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const signed = await signClaim(makeClaim({ chainId: 1 }), attester)
    const replayed: Claim = { ...signed, chainId: 11155111 }
    const result = await verifyClaim(replayed, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a claim whose addr was changed after signing', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const signed = await signClaim(makeClaim(), attester)
    const tampered: Claim = { ...signed, addr: STRANGER_ADDR }
    const result = await verifyClaim(tampered, {
      ...trusted,
      expectedOwner: STRANGER_ADDR,
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })

  it('rejects a claim whose att was changed after signing', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const signed = await signClaim(makeClaim(), attester)
    // Attacker rewrites att to STRANGER_ADDR. Hash changes, recovered no
    // longer matches claim.att → bad-signature (even before the trust check).
    const tampered: Claim = { ...signed, att: STRANGER_ADDR }
    const result = await verifyClaim(tampered, {
      trustedAttesters: [STRANGER_ADDR],
      expectedOwner: WALLET_ADDR,
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })
})

describe('verifyClaim — trust and staleness', () => {
  it('rejects a valid signature from an untrusted attester', async () => {
    const stranger = makeWalletClient(STRANGER_PRIVATE_KEY)
    // The stranger signs a perfectly well-formed claim. The signature is
    // cryptographically valid, but the verifier doesn't trust this attester.
    const signed = await signClaim(makeClaim({ att: STRANGER_ADDR }), stranger)
    const result = await verifyClaim(signed, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('untrusted-attester')
  })

  it('rejects a valid claim whose observed addr is no longer the ENS owner', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const signed = await signClaim(makeClaim(), attester)
    // The wallet at attestation time was WALLET_ADDR. Suppose the name
    // has since transferred to STRANGER_ADDR — the proof is now stale.
    const result = await verifyClaim(signed, {
      ...trusted,
      expectedOwner: STRANGER_ADDR,
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('wrong-owner')
  })

  it('rejects an expired claim', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const signed = await signClaim(
      makeClaim({ exp: Math.floor(Date.now() / 1000) - 10 }),
      attester,
    )
    const result = await verifyClaim(signed, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('expired')
  })
})

describe('replay scenario — alice.eth claim cannot be used for bob.eth', () => {
  it('is the whole point of putting name in the hash', async () => {
    const attester = makeWalletClient(ATTESTER_PRIVATE_KEY)
    const aliceClaim = await signClaim(makeClaim({ name: 'alice.eth' }), attester)

    // Attacker copies the signed claim, swaps in bob.eth, tries to present
    // it as a bob.eth proof. Verifier re-hashes with name="bob.eth" and
    // recovers a different address — bad-signature.
    const replayed: Claim = { ...aliceClaim, name: 'bob.eth' }
    const result = await verifyClaim(replayed, trustedWithOwner)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })
})

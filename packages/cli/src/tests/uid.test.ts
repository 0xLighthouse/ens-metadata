import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyUidAttestationMock = vi.fn()
const publicClientForNameMock = vi.fn()

vi.mock('../lib/verify-attestation.js', () => ({
  verifyUidAttestation: (client: unknown, config: unknown, opts: unknown) =>
    verifyUidAttestationMock(client, config, opts),
}))

vi.mock('../lib/context.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/context.js')>('../lib/context.js')
  return {
    ...actual,
    publicClientForName: (...args: unknown[]) => {
      publicClientForNameMock(...args)
      const name = args[1] as string
      const chain = name.endsWith('.base.eth')
        ? { id: 8453, name: 'base' }
        : { id: 1, name: 'mainnet' }
      return { client: { chain }, chain }
    },
  }
})

import { verifyUidCommand } from '../commands/attestation/verify/uid.js'

const baseRun = (
  name: string,
  options: Partial<{ attester: string; maxAge: number; rpc: string }> = {},
) =>
  verifyUidCommand.run({
    args: { name, platform: 'com.x', uid: 'some-uid' },
    options: { attester: 'atst.lighthousegov.eth', ...options },
    env: {},
  })

describe('verifyUidCommand.run', () => {
  beforeEach(() => {
    verifyUidAttestationMock.mockReset()
    verifyUidAttestationMock.mockResolvedValue({ valid: true })
    publicClientForNameMock.mockReset()
  })

  it('builds a single client for the subject (mainnet)', async () => {
    await baseRun('myagent.eth')
    expect(verifyUidAttestationMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock.mock.calls[0][1]).toBe('myagent.eth')
  })

  it('builds a single client for *.base.eth subjects (no secondary client)', async () => {
    await baseRun('alice.base.eth', { attester: 'foo.base.eth' })
    expect(verifyUidAttestationMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock.mock.calls[0][1]).toBe('alice.base.eth')
  })

  it('rejects a mainnet attester for a *.base.eth subject', async () => {
    await expect(baseRun('alice.base.eth')).rejects.toThrow(
      /must be an ENS name on the same chain as the subject \(base\)/,
    )
    expect(verifyUidAttestationMock).not.toHaveBeenCalled()
  })

  it('rejects a *.base.eth attester for a mainnet subject', async () => {
    await expect(baseRun('alice.eth', { attester: 'foo.base.eth' })).rejects.toThrow(
      /must be an ENS name on the same chain as the subject \(mainnet\)/,
    )
    expect(verifyUidAttestationMock).not.toHaveBeenCalled()
  })

  it('threads uid + platform through to the verifier', async () => {
    await baseRun('myagent.eth')
    const opts = verifyUidAttestationMock.mock.calls[0][2] as {
      name: string
      platform: string
      uid: string
      attester: string
    }
    expect(opts).toEqual({
      name: 'myagent.eth',
      platform: 'com.x',
      uid: 'some-uid',
      attester: 'atst.lighthousegov.eth',
    })
  })

  it('does not pass maxAge into the lib (CLI enforces it)', async () => {
    await baseRun('myagent.eth', { maxAge: 600 })
    const config = verifyUidAttestationMock.mock.calls[0][1] as Record<string, unknown>
    expect(config).not.toHaveProperty('maxAge')
  })

  it('overrides a valid result with reason=stale when issuedAt is older than maxAge', async () => {
    const now = Math.floor(Date.now() / 1000)
    verifyUidAttestationMock.mockResolvedValue({
      valid: true,
      uid: 'some-uid',
      issuedAt: now - 7200,
      attester: 'atst.lighthousegov.eth',
      attesterAddress: '0xAttesterAddress',
    })
    const result = (await baseRun('myagent.eth', { maxAge: 3600 })) as {
      valid: boolean
      reason?: string
      uid?: string
      issuedAt?: number
    }
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('stale')
    expect(result.uid).toBe('some-uid')
    expect(result.issuedAt).toBe(now - 7200)
  })

  it('leaves a fresh valid result unchanged when maxAge is set', async () => {
    const now = Math.floor(Date.now() / 1000)
    verifyUidAttestationMock.mockResolvedValue({
      valid: true,
      uid: 'some-uid',
      issuedAt: now - 60,
      attester: 'atst.lighthousegov.eth',
      attesterAddress: '0xAttesterAddress',
    })
    const result = (await baseRun('myagent.eth', { maxAge: 3600 })) as { valid: boolean }
    expect(result.valid).toBe(true)
  })
})

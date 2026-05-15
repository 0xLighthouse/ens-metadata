import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyHandleAttestationMock = vi.fn()
const publicClientForNameMock = vi.fn()

vi.mock('../lib/verify-attestation.js', () => ({
  verifyHandleAttestation: (client: unknown, config: unknown, opts: unknown) =>
    verifyHandleAttestationMock(client, config, opts),
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

import { verifyHandleCommand } from '../commands/attestation/verify/handle.js'

const baseRun = (
  name: string,
  options: Partial<{ attester: string; maxAge: number; rpc: string }> = {},
) =>
  verifyHandleCommand.run({
    args: { name, platform: 'com.x' },
    options: { attester: 'atst.lighthousegov.eth', ...options },
    env: {},
  })

describe('verifyHandleCommand.run', () => {
  beforeEach(() => {
    verifyHandleAttestationMock.mockReset()
    verifyHandleAttestationMock.mockResolvedValue({ valid: true })
    publicClientForNameMock.mockReset()
  })

  it('builds a single client for the subject (mainnet)', async () => {
    await baseRun('myagent.eth')
    expect(verifyHandleAttestationMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock.mock.calls[0][1]).toBe('myagent.eth')
  })

  it('builds a single client for *.base.eth subjects (no secondary client)', async () => {
    await baseRun('alice.base.eth', { attester: 'foo.base.eth' })
    expect(verifyHandleAttestationMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock.mock.calls[0][1]).toBe('alice.base.eth')
  })

  it('rejects a mainnet attester for a *.base.eth subject', async () => {
    await expect(baseRun('alice.base.eth')).rejects.toThrow(
      /must be an ENS name on the same chain as the subject \(base\)/,
    )
    expect(verifyHandleAttestationMock).not.toHaveBeenCalled()
  })

  it('rejects a *.base.eth attester for a mainnet subject', async () => {
    await expect(baseRun('alice.eth', { attester: 'foo.base.eth' })).rejects.toThrow(
      /must be an ENS name on the same chain as the subject \(mainnet\)/,
    )
    expect(verifyHandleAttestationMock).not.toHaveBeenCalled()
  })

  it('does not pass maxAge into the lib (CLI enforces it)', async () => {
    await baseRun('myagent.eth', { maxAge: 600 })
    const config = verifyHandleAttestationMock.mock.calls[0][1] as Record<string, unknown>
    expect(config).not.toHaveProperty('maxAge')
  })

  it('overrides a valid result with reason=stale when issuedAt is older than maxAge', async () => {
    const now = Math.floor(Date.now() / 1000)
    verifyHandleAttestationMock.mockResolvedValue({
      valid: true,
      handle: 'vitalik',
      issuedAt: now - 7200,
      attester: 'atst.lighthousegov.eth',
      attesterAddress: '0xAttesterAddress',
    })
    const result = (await baseRun('myagent.eth', { maxAge: 3600 })) as {
      valid: boolean
      reason?: string
      handle?: string
      issuedAt?: number
    }
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('stale')
    expect(result.handle).toBe('vitalik')
    expect(result.issuedAt).toBe(now - 7200)
  })

  it('leaves a fresh valid result unchanged when maxAge is set', async () => {
    const now = Math.floor(Date.now() / 1000)
    verifyHandleAttestationMock.mockResolvedValue({
      valid: true,
      handle: 'vitalik',
      issuedAt: now - 60,
      attester: 'atst.lighthousegov.eth',
      attesterAddress: '0xAttesterAddress',
    })
    const result = (await baseRun('myagent.eth', { maxAge: 3600 })) as { valid: boolean }
    expect(result.valid).toBe(true)
  })

  it('leaves an already-invalid result unchanged regardless of maxAge', async () => {
    verifyHandleAttestationMock.mockResolvedValue({
      valid: false,
      reason: 'bad-signature',
      attester: 'atst.lighthousegov.eth',
    })
    const result = (await baseRun('myagent.eth', { maxAge: 3600 })) as {
      valid: boolean
      reason: string
    }
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bad-signature')
  })
})

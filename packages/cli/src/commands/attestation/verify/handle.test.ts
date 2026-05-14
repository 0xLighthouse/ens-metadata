import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyHandleAttestationMock = vi.fn()
const publicClientForNameMock = vi.fn()

vi.mock('../../../lib/verify-attestation.js', () => ({
  verifyHandleAttestation: (client: unknown, config: unknown, opts: unknown) =>
    verifyHandleAttestationMock(client, config, opts),
}))

vi.mock('../../../lib/context.js', async () => {
  const actual =
    await vi.importActual<typeof import('../../../lib/context.js')>('../../../lib/context.js')
  return {
    ...actual,
    publicClientForName: (...args: unknown[]) => {
      publicClientForNameMock(...args)
      return { client: { chain: { id: 1 } }, chain: { id: 1, name: 'mainnet' } }
    },
  }
})

import { verifyHandleCommand } from './handle.js'

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

  it('builds a mainnet client for mainnet names', async () => {
    await baseRun('myagent.eth')
    expect(verifyHandleAttestationMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock.mock.calls[0][1]).toBe('myagent.eth')
  })

  it('builds a mainnet client for *.base.eth too (CCIP-Read handles L2 lookup)', async () => {
    await baseRun('alice.base.eth')
    expect(verifyHandleAttestationMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock.mock.calls[0][1]).toBe('alice.base.eth')
  })

  it('rejects --attester values that end in .base.eth', async () => {
    await expect(baseRun('alice.eth', { attester: 'foo.base.eth' })).rejects.toThrow(
      /Attesters on other chains are not yet supported/,
    )
    expect(verifyHandleAttestationMock).not.toHaveBeenCalled()
  })

  it('threads maxAge through when provided', async () => {
    await baseRun('myagent.eth', { maxAge: 600 })
    const config = verifyHandleAttestationMock.mock.calls[0][1] as { maxAge?: number }
    expect(config.maxAge).toBe(600)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyUidAttestationMock = vi.fn()
const publicClientForNameMock = vi.fn()

vi.mock('../../../lib/verify-attestation.js', () => ({
  verifyUidAttestation: (client: unknown, config: unknown, opts: unknown) =>
    verifyUidAttestationMock(client, config, opts),
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

import { verifyUidCommand } from './uid.js'

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

  it('builds a mainnet client for mainnet names', async () => {
    await baseRun('myagent.eth')
    expect(verifyUidAttestationMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock.mock.calls[0][1]).toBe('myagent.eth')
  })

  it('builds a mainnet client for *.base.eth too (CCIP-Read handles L2 lookup)', async () => {
    await baseRun('alice.base.eth')
    expect(verifyUidAttestationMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock).toHaveBeenCalledTimes(1)
    expect(publicClientForNameMock.mock.calls[0][1]).toBe('alice.base.eth')
  })

  it('rejects --attester values that end in .base.eth', async () => {
    await expect(baseRun('alice.eth', { attester: 'foo.base.eth' })).rejects.toThrow(
      /Attesters on other chains are not yet supported/,
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
})

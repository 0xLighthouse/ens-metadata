import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyUidAttestationMock = vi.fn()

vi.mock('@ensmetadata/sdk', async () => {
  const actual = await vi.importActual<typeof import('@ensmetadata/sdk')>('@ensmetadata/sdk')
  return {
    ...actual,
    verifyUidAttestation: (client: unknown, config: unknown, opts: unknown) =>
      verifyUidAttestationMock(client, config, opts),
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
  })

  it('does not pass basePublicClient for mainnet names', async () => {
    await baseRun('myagent.eth')
    expect(verifyUidAttestationMock).toHaveBeenCalledTimes(1)
    const config = verifyUidAttestationMock.mock.calls[0][1] as {
      basePublicClient?: unknown
    }
    expect(config.basePublicClient).toBeUndefined()
  })

  it('passes basePublicClient for *.base.eth', async () => {
    await baseRun('alice.base.eth')
    expect(verifyUidAttestationMock).toHaveBeenCalledTimes(1)
    const config = verifyUidAttestationMock.mock.calls[0][1] as {
      basePublicClient?: { chain?: { id?: number } }
    }
    expect(config.basePublicClient).toBeDefined()
    expect(config.basePublicClient?.chain?.id).toBe(8453)
  })

  it('rejects --attester values that end in .base.eth', async () => {
    await expect(baseRun('alice.eth', { attester: 'foo.base.eth' })).rejects.toThrow(
      /Custom attesters on Base are not yet supported/,
    )
    expect(verifyUidAttestationMock).not.toHaveBeenCalled()
  })

  it('threads uid + platform through to the SDK', async () => {
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

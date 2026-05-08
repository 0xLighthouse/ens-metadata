import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyHandleAttestationMock = vi.fn()

vi.mock('@ensmetadata/sdk', async () => {
  const actual = await vi.importActual<typeof import('@ensmetadata/sdk')>('@ensmetadata/sdk')
  return {
    ...actual,
    verifyHandleAttestation: (client: unknown, config: unknown, opts: unknown) =>
      verifyHandleAttestationMock(client, config, opts),
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
  })

  it('does not pass basePublicClient for mainnet names', async () => {
    await baseRun('myagent.eth')
    expect(verifyHandleAttestationMock).toHaveBeenCalledTimes(1)
    const config = verifyHandleAttestationMock.mock.calls[0][1] as {
      basePublicClient?: unknown
    }
    expect(config.basePublicClient).toBeUndefined()
  })

  it('passes basePublicClient for *.base.eth', async () => {
    await baseRun('alice.base.eth')
    expect(verifyHandleAttestationMock).toHaveBeenCalledTimes(1)
    const config = verifyHandleAttestationMock.mock.calls[0][1] as {
      basePublicClient?: { chain?: { id?: number } }
    }
    expect(config.basePublicClient).toBeDefined()
    expect(config.basePublicClient?.chain?.id).toBe(8453)
  })

  it('rejects --attester values that end in .base.eth', async () => {
    await expect(baseRun('alice.eth', { attester: 'foo.base.eth' })).rejects.toThrow(
      /Custom attesters on Base are not yet supported/,
    )
    expect(verifyHandleAttestationMock).not.toHaveBeenCalled()
  })

  it('threads maxAge through when provided', async () => {
    await baseRun('myagent.eth', { maxAge: 600 })
    const config = verifyHandleAttestationMock.mock.calls[0][1] as { maxAge?: number }
    expect(config.maxAge).toBe(600)
  })
})

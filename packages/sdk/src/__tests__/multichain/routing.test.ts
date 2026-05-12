import { describe, expect, it } from 'vitest'
import { MissingChainClientError, chainForName } from '../../multichain/routing'

describe('chainForName', () => {
  it('returns "base" for strict subdomains of base.eth', () => {
    expect(chainForName('alice.base.eth')).toBe('base')
    expect(chainForName('team.foo.base.eth')).toBe('base')
  })

  it('returns "mainnet" for plain *.eth names', () => {
    expect(chainForName('alice.eth')).toBe('mainnet')
    expect(chainForName('foo.bar.eth')).toBe('mainnet')
  })

  it('returns "mainnet" for the 2LD base.eth itself', () => {
    // base.eth is owned and resolved on L1; only its subdomains live on Base.
    expect(chainForName('base.eth')).toBe('mainnet')
  })

  it('normalizes input so case does not matter', () => {
    expect(chainForName('Alice.Base.Eth')).toBe('base')
    expect(chainForName('ALICE.ETH')).toBe('mainnet')
  })
})

describe('MissingChainClientError', () => {
  it('captures chain and name on the instance', () => {
    const err = new MissingChainClientError('base', 'alice.base.eth')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(MissingChainClientError)
    expect(err.chain).toBe('base')
    expect(err.name).toBe('alice.base.eth')
    expect(err.message).toMatch(/base/)
    expect(err.message).toMatch(/alice\.base\.eth/)
  })
})

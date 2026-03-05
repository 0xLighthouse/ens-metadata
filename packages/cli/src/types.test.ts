import { describe, it, expect } from 'vitest'
import { SCHEMA_8004_V2 } from './types.js'

const BASE = {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  name: 'Test Agent',
  description: 'A test agent for validating ERC-8004 schema compliance.',
  active: false,
  x402Support: false,
}

function withServices(services: unknown[]) {
  return { ...BASE, services }
}

describe('SCHEMA_8004_V2 — known service types', () => {
  it('accepts a valid MCP service', () => {
    const result = SCHEMA_8004_V2.safeParse(withServices([
      { name: 'MCP', endpoint: 'https://mcp.example.com/', version: '2025-11-25' },
    ]))
    expect(result.success).toBe(true)
  })

  it('accepts a valid A2A service', () => {
    const result = SCHEMA_8004_V2.safeParse(withServices([
      { name: 'A2A', endpoint: 'https://agent.example/.well-known/agent-card.json', version: '0.3.0' },
    ]))
    expect(result.success).toBe(true)
  })

  it('accepts a valid web service', () => {
    const result = SCHEMA_8004_V2.safeParse(withServices([
      { name: 'web', endpoint: 'https://example.com/' },
    ]))
    expect(result.success).toBe(true)
  })

  it('accepts a valid email service', () => {
    const result = SCHEMA_8004_V2.safeParse(withServices([
      { name: 'email', endpoint: 'agent@example.com' },
    ]))
    expect(result.success).toBe(true)
  })

  it('accepts a valid ENS service (issue #24 — was rejected before)', () => {
    const result = SCHEMA_8004_V2.safeParse(withServices([
      { name: 'ENS', endpoint: 'myagent.eth', version: 'v1' },
    ]))
    expect(result.success).toBe(true)
  })

  it('accepts an ENS service without version (version is optional)', () => {
    const result = SCHEMA_8004_V2.safeParse(withServices([
      { name: 'ENS', endpoint: 'prime.eth' },
    ]))
    expect(result.success).toBe(true)
  })

  it('accepts a valid DID service (issue #24 — was rejected before)', () => {
    const result = SCHEMA_8004_V2.safeParse(withServices([
      { name: 'DID', endpoint: 'did:ethr:0x1234567890abcdef1234567890abcdef12345678' },
    ]))
    expect(result.success).toBe(true)
  })

  it('accepts DID with did:web method', () => {
    const result = SCHEMA_8004_V2.safeParse(withServices([
      { name: 'DID', endpoint: 'did:web:example.com' },
    ]))
    expect(result.success).toBe(true)
  })
})

describe('SCHEMA_8004_V2 — unknown/custom service types', () => {
  it('accepts an unknown service type (spec allows custom endpoints)', () => {
    const result = SCHEMA_8004_V2.safeParse(withServices([
      { name: 'xmtp', endpoint: 'xmtp://0xabc' },
    ]))
    expect(result.success).toBe(true)
  })

  it('accepts a mix of known and unknown service types', () => {
    const result = SCHEMA_8004_V2.safeParse(withServices([
      { name: 'MCP', endpoint: 'https://mcp.example.com/', version: '2025-11-25' },
      { name: 'ENS', endpoint: 'myagent.eth' },
      { name: 'customProtocol', endpoint: 'custom://some-id' },
    ]))
    expect(result.success).toBe(true)
  })
})

describe('SCHEMA_8004_V2 — invalid inputs', () => {
  it('rejects an ENS service with a missing endpoint', () => {
    const result = SCHEMA_8004_V2.safeParse(withServices([
      { name: 'ENS' },
    ]))
    expect(result.success).toBe(false)
  })

  it('rejects an email service with a non-email endpoint', () => {
    const result = SCHEMA_8004_V2.safeParse(withServices([
      { name: 'email', endpoint: 'not-an-email' },
    ]))
    expect(result.success).toBe(false)
  })

  it('rejects a missing required top-level field (description)', () => {
    const { description: _, ...noDesc } = BASE
    const result = SCHEMA_8004_V2.safeParse({ ...noDesc, services: [] })
    expect(result.success).toBe(false)
  })
})

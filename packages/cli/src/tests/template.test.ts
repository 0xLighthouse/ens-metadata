import { SCHEMA_MAP } from '@ensmetadata/schemas'
import registryRaw from '@ensmetadata/schemas/registry' with { type: 'json' }
import { describe, expect, it } from 'vitest'
import { buildTemplatePayload, templateCommand } from '../commands/template.js'

const AGENT_SCHEMA = SCHEMA_MAP.Agent

interface VersionEntry {
  cid: string
  checksum: string
  timestamp: number
  schemaPath: string
}
interface SchemaEntry {
  latest: string
  published: Record<string, VersionEntry>
}
const registry = registryRaw as { schemas: Record<string, SchemaEntry> }

const agentRegistry = registry.schemas.agent
const orgRegistry = registry.schemas.org

async function runTemplate(type: string, version?: string) {
  return await templateCommand.run({
    args: { type },
    options: version ? { version } : {},
  })
}

describe('templateCommand', () => {
  it('resolves lowercase registry id (`agent`) to the Agent schema', async () => {
    const out = await runTemplate('agent')
    expect(typeof out).toBe('object')
    expect(out).toHaveProperty('class', 'Agent')
    expect(out).toHaveProperty(
      'schema',
      `ipfs://${agentRegistry.published[agentRegistry.latest].cid}`,
    )
  })

  it('resolves TitleCase title (`Organization`) to the org registry id', async () => {
    const out = await runTemplate('Organization')
    expect(out).toHaveProperty('class', 'Organization')
    expect(out).toHaveProperty('schema', `ipfs://${orgRegistry.published[orgRegistry.latest].cid}`)
  })

  it('also resolves the org short id directly', async () => {
    const out = await runTemplate('org')
    expect(out).toHaveProperty('class', 'Organization')
  })

  it('supports an explicit older --version', async () => {
    const versions = Object.keys(agentRegistry.published).sort()
    const older = versions[0]
    const out = await runTemplate('agent', older)
    expect(out).toHaveProperty('schema', `ipfs://${agentRegistry.published[older].cid}`)
  })

  it('throws on unknown schema type', async () => {
    await expect(runTemplate('not-a-real-type')).rejects.toThrow(/Unknown schema type/)
  })

  it('throws on unknown version', async () => {
    await expect(runTemplate('agent', '99.99.99')).rejects.toThrow(/not found for schema/)
  })

  it('initialises every property except class/schema to ""', async () => {
    const out = (await runTemplate('agent')) as Record<string, string>
    for (const key of Object.keys(AGENT_SCHEMA.properties)) {
      if (key === 'class' || key === 'schema') continue
      expect(out[key]).toBe('')
    }
  })

  it('emits keys in declared property order', async () => {
    const out = (await runTemplate('agent')) as Record<string, string>
    expect(Object.keys(out)).toEqual(Object.keys(AGENT_SCHEMA.properties))
  })

  it('does not emit any patternProperties keys', async () => {
    // The Agent schema uses regex-like keys such as `^services(...)?$`. The
    // template payload must contain only concrete `properties` keys, never
    // raw regex patterns or example pattern keys.
    const out = (await runTemplate('agent')) as Record<string, string>
    const patternKeys = Object.keys(AGENT_SCHEMA.patternProperties ?? {})
    for (const key of Object.keys(out)) {
      expect(patternKeys).not.toContain(key)
      expect(key.startsWith('^')).toBe(false)
      expect(key.includes('[')).toBe(false)
    }
  })

  it('declares JSON as its default output format', () => {
    expect(templateCommand.format).toBe('json')
  })
})

describe('buildTemplatePayload (unit)', () => {
  it('pre-fills class with its declared default', () => {
    const out = buildTemplatePayload(AGENT_SCHEMA, 'ipfs://test-cid')
    expect(out.class).toBe('Agent')
  })

  it('uses the supplied IPFS URI for schema', () => {
    const out = buildTemplatePayload(AGENT_SCHEMA, 'ipfs://test-cid')
    expect(out.schema).toBe('ipfs://test-cid')
  })

  it('falls back to "" for class when no default is declared', () => {
    const synthetic = {
      ...AGENT_SCHEMA,
      properties: {
        class: { type: 'string', description: 'no default declared' },
        schema: AGENT_SCHEMA.properties.schema,
      },
    }
    const out = buildTemplatePayload(synthetic, 'ipfs://x')
    expect(out.class).toBe('')
  })
})

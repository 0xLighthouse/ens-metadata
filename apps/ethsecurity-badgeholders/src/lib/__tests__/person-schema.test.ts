import { PERSON_SCHEMA_URI } from '@/lib/constants'
import { PERSON_SCHEMA, PERSON_SCHEMA_KEYS } from '@/lib/person-schema'
import { describe, expect, it } from 'vitest'
import latest from '../../../../../packages/schemas/published/_latest.json'
import published from '../../../../../packages/schemas/published/person/versions/3.0.1/schema.json'

describe('PERSON_SCHEMA', () => {
  it('is the published document behind PERSON_SCHEMA_URI', () => {
    expect(PERSON_SCHEMA).toEqual(published)
    expect(PERSON_SCHEMA_URI).toBe(`ipfs://${latest.person.cid}`)
    expect(PERSON_SCHEMA.version).toBe(latest.person.version)
  })

  it('declares the keys the editor validates against', () => {
    expect([...PERSON_SCHEMA_KEYS]).toContain('description')
    expect([...PERSON_SCHEMA_KEYS]).not.toContain('name')
  })
})

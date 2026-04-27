import { readFileSync } from 'node:fs'
import { SCHEMA_MAP } from '@ensmetadata/schemas'
import { validateMetadataSchema } from '@ensmetadata/sdk'
import { z } from 'zod'

export const validateCommand = {
  description: 'Validate ENS metadata payload against agent schema',
  args: z.object({
    file: z.string().describe('Path to payload.json'),
  }),
  options: z.object({}),
  run(c: { args: { file: string } }) {
    const raw: unknown = JSON.parse(readFileSync(c.args.file, 'utf8'))
    const result = validateMetadataSchema(raw, SCHEMA_MAP.Agent)
    if (result.success) {
      return {
        valid: true,
        recordCount: Object.keys(result.data).length,
      }
    }
    const errors = result.errors.map(({ key, message }) => ({ key, message }))
    process.exitCode = 1
    return { valid: false, errors }
  },
}

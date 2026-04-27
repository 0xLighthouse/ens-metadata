import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { validateRegistrationFile } from '../../../index.js'

export const validateCommand = {
  description: 'Validate registration file against ERC-8004 v2.0 schema',
  args: z.object({
    file: z.string().describe('Path to registration-file.json'),
  }),
  options: z.object({}),
  run(c: { args: { file: string } }) {
    const raw: unknown = JSON.parse(readFileSync(c.args.file, 'utf8'))
    const result = validateRegistrationFile(raw)
    if (result.success) {
      return { valid: true }
    }
    process.exitCode = 1
    return {
      valid: false,
      errors: result.error.issues.map((i) => ({
        path: i.path.join('.') || 'root',
        message: i.message,
      })),
    }
  },
}

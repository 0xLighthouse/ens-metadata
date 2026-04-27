import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __dirname = dirname(fileURLToPath(import.meta.url))

function getSkillMdPath(): string {
  const candidates = [
    join(__dirname, '../../SKILL.md'),
    join(__dirname, '../SKILL.md'),
    join(__dirname, 'SKILL.md'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error('SKILL.md not found in package')
}

export const skillCommand = {
  description: 'Print the SKILL.md guide for this CLI',
  args: z.object({}),
  options: z.object({}),
  run() {
    const content = readFileSync(getSkillMdPath(), 'utf8')
    process.stdout.write(content)
    return { ok: true }
  },
}

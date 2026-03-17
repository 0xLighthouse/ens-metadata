import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Text } from 'ink'
import React from 'react'

export const description = 'Print the SKILL.md guide for this CLI'

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

export default function Skill() {
  try {
    const content = readFileSync(getSkillMdPath(), 'utf8')
    return <Text>{content}</Text>
  } catch (err) {
    return <Text color="red">❌ {(err as Error).message}</Text>
  }
}

import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Text, useApp } from 'ink'
import React from 'react'
import { z } from 'zod'

export const description = 'Print or install SKILL.md guide'

export const options = z.object({
  install: z.boolean().default(false).describe('Copy SKILL.md to the current working directory'),
})

type Props = {
  options: z.infer<typeof options>
}

const __dirname = dirname(fileURLToPath(import.meta.url))

function getSkillMdPath(): string {
  // When built: dist/commands/skill.js → root is ../../
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

export default function Skill({ options: { install } }: Props) {
  const { exit } = useApp()
  const [output, setOutput] = React.useState<string>('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    try {
      const skillPath = getSkillMdPath()
      const content = readFileSync(skillPath, 'utf8')

      if (install) {
        const dest = resolve(process.cwd(), 'SKILL.md')
        copyFileSync(skillPath, dest)
        setOutput(`✅ SKILL.md copied to ${dest}`)
      } else {
        setOutput(content)
      }
    } catch (err) {
      setError((err as Error).message)
    }
    exit()
  }, [exit, install])

  if (error) {
    return <Text color="red">❌ {error}</Text>
  }
  return <Text>{output}</Text>
}

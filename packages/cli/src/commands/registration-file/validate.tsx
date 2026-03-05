import { readFileSync } from 'node:fs'
import { Box, Text, useApp } from 'ink'
import React from 'react'
import { z } from 'zod'
import { validateRegistrationFile } from '../../index.js'
import { ZodIssueList } from '../../lib/ui.js'

export const description = 'Validate registration file against ERC-8004 v2.0 schema'

export const args = z.tuple([z.string().describe('registration-file.json')])

type Props = {
  args: z.infer<typeof args>
}

export default function RegistrationFileValidate({ args: [file] }: Props) {
  const { exit } = useApp()

  let fileError: string | null = null
  let result: ReturnType<typeof validateRegistrationFile> | null = null
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
    result = validateRegistrationFile(raw)
  } catch (err) {
    fileError = (err as Error).message
  }

  React.useEffect(() => {
    exit(fileError || (result && !result.success) ? new Error('validation failed') : undefined)
  }, [exit, fileError, result])

  if (fileError) {
    return <Text color="red">❌ Error reading file: {fileError}</Text>
  }

  if (result!.success) {
    return (
      <Box flexDirection="column">
        <Text color="green">✅ Valid ERC-8004 v2.0 AgentRegistrationFile</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text color="red">❌ Invalid AgentRegistrationFile</Text>
      <ZodIssueList issues={result!.error.issues} />
    </Box>
  )
}

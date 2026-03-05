import { readFileSync } from 'node:fs'
import { Box, Text, useApp } from 'ink'
import React from 'react'
import { z } from 'zod'
import { SCHEMA_MAP } from '@ens-node-metadata/schemas'
import { validateMetadataSchema, type MetadataValidationResult } from '@ens-node-metadata/sdk'

export const description = 'Validate ENS metadata payload against agent schema'

export const args = z.tuple([z.string().describe('payload.json')])

type Props = {
  args: z.infer<typeof args>
}

export default function MetadataValidate({ args: [file] }: Props) {
  const { exit } = useApp()

  let fileError: string | null = null
  let result: MetadataValidationResult | null = null

  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
    result = validateMetadataSchema(raw, SCHEMA_MAP.Agent)
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
        <Text color="green">✅ Valid ENS agent metadata payload</Text>
        <Text color="gray"> {Object.keys(result!.data).length} text records</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text color="red">❌ Invalid agent metadata payload</Text>
      {result!.errors.map(({ key, message }) => (
        <Text key={key} color="red">
          {'  '}[{key}] {message}
        </Text>
      ))}
    </Box>
  )
}

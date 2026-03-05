import { readFileSync } from 'node:fs'
import { Box, Text, useApp } from 'ink'
import React from 'react'
import { z } from 'zod'
import { validateRegistrationFile } from '../../index.js'
import { publishFile } from '@ens-node-metadata/shared'

export const description = 'Publish registration file to IPFS via Pinata'

export const args = z.tuple([z.string().describe('registration-file.json')])

type Props = {
  args: z.infer<typeof args>
}

type State =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'uploading' }
  | { status: 'done'; uri: string }
  | { status: 'error'; message: string }

export default function RegistrationFilePublish({ args: [file] }: Props) {
  const { exit } = useApp()
  const [state, setState] = React.useState<State>({ status: 'idle' })

  React.useEffect(() => {
    async function run() {
      // 1. Check env vars
      const pinataJwt = process.env.PINATA_JWT
      const pinataKey = process.env.PINATA_API_KEY
      const pinataSecret = process.env.PINATA_API_SECRET
      if (!pinataJwt && !(pinataKey && pinataSecret)) {
        setState({
          status: 'error',
          message:
            'Missing Pinata credentials. Set PINATA_JWT or both PINATA_API_KEY and PINATA_API_SECRET.',
        })
        exit(new Error('missing env vars'))
        return
      }

      // 2. Validate registration file
      setState({ status: 'validating' })
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(file, 'utf8'))
      } catch (err) {
        setState({ status: 'error', message: `Error reading file: ${(err as Error).message}` })
        exit(new Error('read error'))
        return
      }

      const result = validateRegistrationFile(raw)
      if (!result.success) {
        const issues = result.error.issues
          .map((i) => `[${i.path.join('.') || 'root'}] ${i.message}`)
          .join('\n')
        setState({ status: 'error', message: `Invalid registration file:\n${issues}` })
        exit(new Error('validation failed'))
        return
      }

      // 3. Upload to IPFS via Pinata
      setState({ status: 'uploading' })
      try {
        const { cid } = await publishFile({
          provider: 'pinata',
          filePath: file,
          pinataJwt,
          pinataKey,
          pinataSecret,
          schemaId: result.data.name,
          version: '1.0.0',
        })
        const uri = `ipfs://${cid}`
        process.stdout.write(`${JSON.stringify({ cid, uri })}\n`)
        setState({ status: 'done', uri })
        exit()
      } catch (err) {
        setState({ status: 'error', message: `Upload failed: ${(err as Error).message}` })
        exit(new Error('upload failed'))
      }
    }

    run()
  }, [exit, file])

  return (
    <Box flexDirection="column">
      {state.status === 'idle' && <Text color="gray">Preparing…</Text>}
      {state.status === 'validating' && <Text color="cyan">Validating registration file…</Text>}
      {state.status === 'uploading' && <Text color="cyan">Uploading to IPFS via Pinata…</Text>}
      {state.status === 'done' && (
        <Box flexDirection="column">
          <Text color="green">✅ Published to IPFS</Text>
          <Text>{state.uri}</Text>
        </Box>
      )}
      {state.status === 'error' && (
        <Box flexDirection="column">
          <Text color="red">❌ {state.message}</Text>
        </Box>
      )}
    </Box>
  )
}

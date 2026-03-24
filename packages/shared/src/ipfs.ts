import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function publishToIpfs(cmd: string, filePath: string): string {
  const output = execSync(`${cmd} ${filePath}`, { encoding: 'utf8' }).trim()
  const lines = output.split(/\r?\n/).filter(Boolean)
  const last = lines[lines.length - 1] ?? ''
  const parts = last.split(/\s+/)
  if (parts.length === 1) return parts[0]
  if (parts[0] === 'added' && parts[1]) return parts[1]
  return parts[parts.length - 1]
}

async function publishToPinata(input: {
  filePath: string
  jwt?: string
  apiKey?: string
  apiSecret?: string
  schemaId: string
  version: string
}): Promise<string> {
  const buffer = await fs.promises.readFile(input.filePath)
  const form = new FormData()
  form.set('file', new Blob([buffer]), path.basename(input.filePath))
  form.set(
    'pinataMetadata',
    JSON.stringify({
      name: `${input.schemaId}@${input.version}`,
      keyvalues: { schemaId: input.schemaId, version: input.version },
    }),
  )
  const headers: Record<string, string> = {}
  if (input.jwt) {
    headers.Authorization = `Bearer ${input.jwt}`
  } else if (input.apiKey && input.apiSecret) {
    headers.pinata_api_key = input.apiKey
    headers.pinata_secret_api_key = input.apiSecret
  }
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers,
    body: form,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Pinata upload failed: ${response.status} ${text}`)
  }
  const data = (await response.json()) as { IpfsHash?: string }
  if (!data.IpfsHash) throw new Error('Pinata response missing IpfsHash')
  return data.IpfsHash
}

export async function publishFile(input: {
  provider: 'pinata' | 'ipfs'
  filePath: string
  ipfsCmd?: string
  pinataJwt?: string
  pinataKey?: string
  pinataSecret?: string
  schemaId: string
  version: string
}): Promise<{ cid: string; publisher: string }> {
  if (input.provider === 'ipfs') {
    return { cid: publishToIpfs(input.ipfsCmd ?? 'ipfs add -q', input.filePath), publisher: 'ipfs' }
  }
  const cid = await publishToPinata({
    filePath: input.filePath,
    jwt: input.pinataJwt,
    apiKey: input.pinataKey,
    apiSecret: input.pinataSecret,
    schemaId: input.schemaId,
    version: input.version,
  })
  return { cid, publisher: 'pinata' }
}

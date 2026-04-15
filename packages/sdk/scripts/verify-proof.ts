#!/usr/bin/env tsx
/**
 * Dev script — look up and verify a social proof on an ENS name via the SDK.
 *
 * Usage:
 *   pnpm --filter @ensmetadata/sdk verify-proof <ens-name> [platform] [--deep]
 *
 * Examples:
 *   pnpm --filter @ensmetadata/sdk verify-proof lighthousegov.eth
 *   pnpm --filter @ensmetadata/sdk verify-proof lighthousegov.eth twitter
 *   pnpm --filter @ensmetadata/sdk verify-proof lighthousegov.eth twitter --deep
 *
 * Env:
 *   RPC_URL — optional mainnet RPC endpoint (falls back to a public one)
 */

import { addEnsContracts } from '@ensdomains/ensjs'
import { http, type PublicClient, createPublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import { fetchAndVerifyFullProof, verifyProof } from '../src/verify.js'

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

function c(color: keyof typeof COLORS, text: string): string {
  return `${COLORS[color]}${text}${COLORS.reset}`
}

function header(text: string): void {
  console.log(`\n${c('bold', text)}`)
  console.log(c('gray', '-'.repeat(text.length)))
}

function kv(key: string, value: string | number | undefined): void {
  if (value === undefined || value === '') return
  console.log(`  ${c('gray', key.padEnd(12))} ${value}`)
}

function usage(): never {
  console.error(`Usage: verify-proof <ens-name> [platform] [--deep]

Examples:
  verify-proof lighthousegov.eth
  verify-proof lighthousegov.eth twitter
  verify-proof lighthousegov.eth twitter --deep`)
  process.exit(1)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 0 || args[0].startsWith('--')) usage()

  const name = args[0]
  const positional = args.slice(1).filter((a) => !a.startsWith('--'))
  const flags = args.slice(1).filter((a) => a.startsWith('--'))
  const platform = positional[0] ?? 'twitter'
  const deep = flags.includes('--deep')

  header('Setup')
  console.log(`  ${c('gray', 'ENS name    ')} ${c('cyan', name)}`)
  console.log(`  ${c('gray', 'Platform    ')} ${platform}`)
  console.log(
    `  ${c('gray', 'Mode        ')} ${deep ? 'deep (fetches full proof)' : 'cheap (text record only)'}`,
  )
  console.log(`  ${c('gray', 'Chain       ')} mainnet`)
  // Default to a known-good public RPC. The viem built-in public endpoint
  // is flaky for mainnet ENS reads and can hang multi-minute.
  const rpcUrl = process.env.RPC_URL ?? 'https://eth.llamarpc.com'
  console.log(
    `  ${c('gray', 'RPC URL     ')} ${rpcUrl}${process.env.RPC_URL ? '' : c('dim', '  (default)')}`,
  )

  header('Creating public client')
  const client = createPublicClient({
    chain: addEnsContracts(mainnet),
    transport: http(rpcUrl),
  }) as unknown as PublicClient
  console.log(
    c('dim', '  createPublicClient({ chain: addEnsContracts(mainnet), transport: http() })'),
  )

  header('Calling SDK verifyProof (cheap path)')
  console.log(c('dim', `  verifyProof(client, { name: '${name}', platform: '${platform}' })`))
  console.log(c('dim', `  -> reads ENS text record "proof.${platform}"`))
  console.log(c('dim', '  -> hex-decodes + dag-cbor decodes the claim'))
  console.log(c('dim', '  -> resolves ENS owner'))
  console.log(c('dim', '  -> re-encodes claim without sig, keccak256, ecrecover'))
  console.log(c('dim', '  -> compares recovered address to ENS owner'))

  const start = Date.now()
  const result = await verifyProof(client, { name, platform })
  const elapsed = Date.now() - start

  header(`Result  ${c('gray', `(${elapsed}ms)`)}`)
  if (result.valid) {
    console.log(`  ${c('green', '[OK] VERIFIED')}`)
  } else {
    console.log(`  ${c('red', '[FAIL] INVALID')} ${c('gray', `(${result.reason ?? 'unknown'})`)}`)
  }
  kv('handle', result.handle ? `@${result.handle}` : undefined)
  kv('uid', result.uid)
  kv(
    'expires',
    result.expiresAt
      ? `${new Date(result.expiresAt * 1000).toISOString()} (${result.expiresAt})`
      : undefined,
  )
  kv('cid', result.cid)

  if (deep && result.cid) {
    header('Calling SDK fetchAndVerifyFullProof (deep path)')
    console.log(c('dim', '  fetchAndVerifyFullProof(cid)'))
    console.log(c('dim', '  -> fetches proof doc from IPFS gateway'))
    console.log(c('dim', '  -> decodes dag-cbor full-proof'))
    console.log(c('dim', '  -> re-runs claim verification over embedded claim'))

    const gatewayUrl = result.cid.startsWith('http')
      ? result.cid.replace(/\/[^/]+$/, '')
      : 'https://ipfs.io/ipfs'
    const cidOrPath = result.cid.startsWith('http')
      ? result.cid.split('/').pop()
      : result.cid.replace(/^ipfs:\/\//, '')

    if (!cidOrPath) {
      console.log(`  ${c('yellow', '! could not derive CID from reference')}`)
    } else {
      const deepStart = Date.now()
      const deepResult = await fetchAndVerifyFullProof(cidOrPath, { gatewayUrl })
      const deepElapsed = Date.now() - deepStart

      header(`Deep result  ${c('gray', `(${deepElapsed}ms)`)}`)
      if (deepResult.valid) {
        console.log(`  ${c('green', '[OK] VERIFIED')}`)
      } else {
        console.log(
          `  ${c('red', '[FAIL] INVALID')} ${c('gray', `(${deepResult.reason ?? 'unknown'})`)}`,
        )
      }
      kv('method', deepResult.method)
      kv('handle', deepResult.handle ? `@${deepResult.handle}` : undefined)
      kv('uid', deepResult.uid)
    }
  } else if (deep && !result.cid) {
    header('Deep path')
    console.log(`  ${c('yellow', '! skipped — no proof reference in claim')}`)
  }

  console.log()
  process.exit(result.valid ? 0 : 1)
}

main().catch((err) => {
  console.error(
    `\n${c('red', '[FAIL] Error')}: ${err instanceof Error ? err.message : String(err)}`,
  )
  if (err instanceof Error && err.stack) {
    console.error(c('dim', err.stack.split('\n').slice(1).join('\n')))
  }
  process.exit(2)
})

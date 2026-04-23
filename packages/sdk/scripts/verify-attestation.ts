#!/usr/bin/env tsx
/**
 * Dev script — look up and verify a handle attestation on an ENS name via the SDK.
 *
 * Usage:
 *   pnpm --filter @ensmetadata/sdk verify-attestation <ens-name> <attester-addr> [platform]
 *
 * Examples:
 *   pnpm --filter @ensmetadata/sdk verify-attestation lighthousegov.eth 0x7E5F...
 *   pnpm --filter @ensmetadata/sdk verify-attestation lighthousegov.eth 0x7E5F... com.x
 *
 * Env:
 *   RPC_URL            — optional mainnet RPC endpoint (falls back to a public one)
 */

import { addEnsContracts } from '@ensdomains/ensjs'
import { http, type Address, type PublicClient, createPublicClient, isAddress } from 'viem'
import { mainnet } from 'viem/chains'
import { handleAttestationRecordKey, verifyHandleAttestation } from '../src/verify.js'

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
  console.error(`Usage: verify-attestation <ens-name> <attester-addr> [platform]

Examples:
  verify-attestation lighthousegov.eth 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf
  verify-attestation lighthousegov.eth 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf com.x`)
  process.exit(1)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length < 2 || args[0].startsWith('--')) usage()

  const name = args[0]
  const attesterArg = args[1]
  if (!isAddress(attesterArg)) {
    console.error(`\n${c('red', '[FAIL]')} second argument must be a 0x attester address`)
    process.exit(1)
  }
  const attester = attesterArg as Address
  const positional = args.slice(2).filter((a) => !a.startsWith('--'))
  const platform = positional[0] ?? 'com.x'

  header('Setup')
  console.log(`  ${c('gray', 'ENS name    ')} ${c('cyan', name)}`)
  console.log(`  ${c('gray', 'Platform    ')} ${platform}`)
  console.log(`  ${c('gray', 'Attester    ')} ${attester}`)
  console.log(`  ${c('gray', 'Chain       ')} mainnet`)
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

  header('Calling SDK verifyHandleAttestation')
  console.log(
    c(
      'dim',
      `  verifyHandleAttestation(client, config, { name: '${name}', platform: '${platform}', attester: '${attester}' })`,
    ),
  )
  console.log(
    c('dim', `  -> reads text record "${handleAttestationRecordKey(platform, attester)}"`),
  )
  console.log(c('dim', `  -> reads text record "${platform}" (the handle)`))
  console.log(c('dim', '  -> resolves ENS owner'))
  console.log(c('dim', '  -> reconstructs dag-cbor payload, keccak256, ecrecover'))
  console.log(c('dim', '  -> verifies recovered === attester arg'))

  const start = Date.now()
  const result = await verifyHandleAttestation(client, {}, { name, platform, attester })
  const elapsed = Date.now() - start

  header(`Result  ${c('gray', `(${elapsed}ms)`)}`)
  if (result.valid) {
    console.log(`  ${c('green', '[OK] VERIFIED')}`)
  } else {
    console.log(`  ${c('red', '[FAIL] INVALID')} ${c('gray', `(${result.reason ?? 'unknown'})`)}`)
  }
  kv('handle', result.handle ? `@${result.handle}` : undefined)
  kv(
    'issuedAt',
    result.issuedAt
      ? `${new Date(result.issuedAt * 1000).toISOString()} (${result.issuedAt})`
      : undefined,
  )
  kv('attester', result.attester)

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

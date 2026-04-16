// Smoke test for the attester worker. Drives the session + SIWE flow end-
// to-end, then exercises the platform/attest endpoints if a real Privy
// access token is supplied — platform validators hard-error without live
// Privy creds, so the attest path is opt-in rather than automatic.
//
// Usage:
//   node workers/attester/scripts/smoke-test.mjs
//   PRIVY_ACCESS_TOKEN=... TWITTER_UID=... TELEGRAM_UID=... node ...
//
// Pre-requisite: the worker must be running locally on port 8787
// (`pnpm attester` from the repo root).

import { decodeEnvelope, decodePayload, verifyClaim } from '@ensmetadata/sdk'
import { hexToBytes, keccak256, recoverMessageAddress, toBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createSiweMessage } from 'viem/siwe'

const ATTESTER = 'http://localhost:8787'
const WALLET_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const EXPECTED_ATTESTER_ADDR = privateKeyToAccount(
  '0x0000000000000000000000000000000000000000000000000000000000000001',
).address
const PRIVY_ACCESS_TOKEN = process.env.PRIVY_ACCESS_TOKEN

const wallet = privateKeyToAccount(WALLET_PK)

function check(label, ok, detail = '') {
  const mark = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`${mark} ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) process.exit(1)
}

async function runSessionFlow() {
  console.log('\n\x1b[1m── session + SIWE ──\x1b[0m')

  const sessionRes = await fetch(`${ATTESTER}/api/session`, { method: 'POST' })
  check('POST /api/session', sessionRes.ok, `status ${sessionRes.status}`)
  const session = await sessionRes.json()
  console.log(`  sessionId: ${session.sessionId}`)

  const message = createSiweMessage({
    address: wallet.address,
    chainId: 1,
    domain: 'localhost:3001',
    nonce: session.nonce,
    uri: 'http://localhost:3001',
    version: '1',
    statement: 'Smoke test',
    issuedAt: new Date(),
  })
  const signature = await wallet.signMessage({ message })

  const bindWalletRes = await fetch(`${ATTESTER}/api/session/wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: session.sessionId, message, signature }),
  })
  const bindWalletBody = await bindWalletRes.json().catch(() => ({}))
  check(
    'POST /api/session/wallet',
    bindWalletRes.ok,
    bindWalletRes.ok ? `wallet=${bindWalletBody.wallet}` : JSON.stringify(bindWalletBody),
  )

  return session
}

async function runPlatformFlow({ platform, expectedHandle }, session) {
  console.log(`\n\x1b[1m── ${platform} (requires PRIVY_ACCESS_TOKEN) ──\x1b[0m`)

  const bindPlatformRes = await fetch(
    `${ATTESTER}/api/session/platform/${encodeURIComponent(platform)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.sessionId,
        payload: { privyAccessToken: PRIVY_ACCESS_TOKEN },
      }),
    },
  )
  const bindPlatformBody = await bindPlatformRes.json().catch(() => ({}))
  check(
    `POST /api/session/platform/${platform}`,
    bindPlatformRes.ok,
    bindPlatformRes.ok
      ? `uid=${bindPlatformBody.uid}, handle=${bindPlatformBody.handle}`
      : JSON.stringify(bindPlatformBody),
  )

  const attestRes = await fetch(`${ATTESTER}/api/attest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: session.sessionId, name: 'alice.eth' }),
  })
  const attestBody = await attestRes.json().catch(() => ({}))
  check('POST /api/attest', attestRes.ok, attestRes.ok ? '' : JSON.stringify(attestBody))

  const envelopeBytes = hexToBytes(attestBody.claimHex)
  check('first byte is 0xDA (CBOR tag header)', envelopeBytes[0] === 0xda)

  const envelope = decodeEnvelope(envelopeBytes)
  const inner = decodePayload(envelope.payload)
  console.log(`  envelope: v=${envelope.version} attester=${envelope.attester}`)

  const verifyResult = await verifyClaim(envelope, {
    trustedAttesters: [EXPECTED_ATTESTER_ADDR],
    expectedOwner: wallet.address,
  })
  check(
    'SDK verifyClaim against returned envelope',
    verifyResult.valid,
    verifyResult.valid ? 'all checks pass' : JSON.stringify(verifyResult),
  )

  // Blinded uid is a signature over keccak256("platform:rawUid"), recoverable
  // to the attester address. The raw uid here comes from Privy's response.
  const uidHash = keccak256(toBytes(`${platform}:${bindPlatformBody.uid}`))
  const recoveredFromUid = await recoverMessageAddress({
    message: { raw: uidHash },
    signature: inner.uid,
  })
  check(
    'ecrecover(u) === attester address',
    recoveredFromUid.toLowerCase() === EXPECTED_ATTESTER_ADDR.toLowerCase(),
    `recovered=${recoveredFromUid}`,
  )

  if (expectedHandle) {
    check('handle matches expectation', inner.handle === expectedHandle)
  }
}

async function main() {
  const session = await runSessionFlow()

  if (!PRIVY_ACCESS_TOKEN) {
    console.log(
      '\n\x1b[33m⚠ PRIVY_ACCESS_TOKEN not set — skipping platform + attest flows.\x1b[0m',
    )
    console.log('\x1b[32mSession / SIWE paths OK.\x1b[0m')
    return
  }

  await runPlatformFlow({ platform: 'com.x' }, session)
  await runPlatformFlow({ platform: 'org.telegram' }, session)

  console.log('\n\x1b[32mAll platforms work.\x1b[0m')
}

main().catch((err) => {
  console.error('\x1b[31m✗ FAIL:\x1b[0m', err.message)
  process.exit(1)
})

/**
 * Server-side walk through Section 7 of the ATST spec, one step at a time,
 * recording what each step produced. This deliberately does not call the
 * CLI's `verifyHandleAttestation` — that returns a verdict, and the whole
 * point here is the intermediate state.
 */
import { addEnsContracts } from '@ensdomains/ensjs'
import { getOwner } from '@ensdomains/ensjs/public'
import {
  type Envelope,
  decodeEnvelope,
  encodeHandlePayload,
  encodeUidPayload,
  handleAttestationRecordKey,
  uidAttestationRecordKey,
} from '@ensmetadata/sdk'
import {
  http,
  type Address,
  type Hex,
  bytesToHex,
  createPublicClient,
  hexToBytes,
  isAddress,
  keccak256,
  namehash,
  recoverMessageAddress,
} from 'viem'
import { getEnsAddress, getEnsText } from 'viem/actions'
import { mainnet } from 'viem/chains'
import { normalize } from 'viem/ens'
import type { Handoff, TraceStep, VerifyRequest, VerifyTrace } from './trace'

/**
 * A public mainnet endpoint, so the playground works with nothing configured.
 * viem's own default (eth.merkle.io) rate-limits hard enough to break a
 * session after a handful of reads. Set `ATST_RPC_URL` to use your own.
 */
const RPC_URL = process.env.ATST_RPC_URL ?? 'https://ethereum-rpc.publicnode.com'

const client = createPublicClient({
  chain: addEnsContracts(mainnet),
  transport: http(RPC_URL),
})

/**
 * A read that separates "the chain says no" from "the read failed". Collapsing
 * the two would make a rate-limited endpoint look like a missing record, which
 * is exactly the wrong answer for a debugging tool.
 */
type Read<T> = { ok: true; value: T } | { ok: false; error: string }

async function read<T>(fn: () => Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0] : 'RPC read failed.'
    return { ok: false, error: message }
  }
}

function step(
  n: number,
  label: string,
  status: TraceStep['status'],
  detail: Array<[string, string]>,
  note?: string,
): TraceStep {
  return { n, label, status, detail, ...(note ? { note } : {}) }
}

const LABELS: Record<number, string> = {
  1: 'Resolve the name owner',
  2: 'Read the handle text record',
  3: 'Read the envelope text record',
  4: 'Reconstruct the payload as DAG-CBOR',
  5: 'Hash and recover the signer',
  6: 'Resolve the attester ENS name',
  7: 'Compare recovered signer to attester',
}

/** Every step from `from` on, marked skipped, so the UI always shows all seven. */
function skipRest(from: number): TraceStep[] {
  return Object.keys(LABELS)
    .map(Number)
    .filter((n) => n >= from)
    .map((n) => step(n, LABELS[n], 'skipped', []))
}

export async function runVerification(req: VerifyRequest): Promise<VerifyTrace> {
  const steps: TraceStep[] = []

  let name: string
  try {
    name = normalize(req.name)
  } catch {
    return {
      valid: false,
      reason: 'invalid-name',
      steps: [
        step(1, LABELS[1], 'fail', [['input', req.name]], 'Name failed ENSIP-15 normalization.'),
        ...skipRest(2),
      ],
    }
  }

  const platform = req.platform.trim()
  const attesterEns = req.attester.trim()
  const rpcRow: [string, string] = ['rpc', RPC_URL]

  // --- Step 1: resolve the name's manager address (payload field `a`) ---
  const ownerRead = await read(() => getOwner(client, { name }))
  if (!ownerRead.ok) {
    return {
      valid: false,
      reason: 'rpc-error',
      steps: [step(1, LABELS[1], 'fail', [rpcRow], ownerRead.error), ...skipRest(2)],
    }
  }

  const resolved = ownerRead.value?.owner
  if (!resolved || !isAddress(resolved)) {
    return {
      valid: false,
      reason: 'owner-not-resolved',
      steps: [
        step(
          1,
          LABELS[1],
          'fail',
          [
            ['name (n)', name],
            ['namehash', namehash(name)],
          ],
          'No owner. The name is unregistered or expired.',
        ),
        ...skipRest(2),
      ],
    }
  }

  const owner = resolved as Address
  steps.push(
    step(1, LABELS[1], 'ok', [
      ['name (n)', name],
      ['namehash', namehash(name)],
      ['owner (a)', owner],
    ]),
  )

  // --- Step 2: obtain the social identifier (payload field `h` or `u`) ---
  let identifier: string
  if (req.mode === 'handle') {
    const handleRead = await read(() => getEnsText(client, { name, key: platform }))
    if (!handleRead.ok) {
      steps.push(step(2, LABELS[2], 'fail', [['record key', platform], rpcRow], handleRead.error))
      return { valid: false, reason: 'rpc-error', steps: [...steps, ...skipRest(3)] }
    }
    if (!handleRead.value) {
      steps.push(
        step(
          2,
          LABELS[2],
          'fail',
          [['record key', platform]],
          'No handle published for this platform, so the payload cannot be reconstructed.',
        ),
      )
      return { valid: false, reason: 'missing', steps: [...steps, ...skipRest(3)] }
    }
    identifier = handleRead.value
    steps.push(
      step(2, LABELS[2], 'ok', [
        ['record key', platform],
        ['handle (h)', identifier],
        ['platform (p)', platform],
      ]),
    )
  } else {
    if (!req.uid) {
      steps.push(
        step(
          2,
          'Obtain the UID out of band',
          'fail',
          [],
          'Section 9 leaves the channel out of scope, so the verifier must be given the UID.',
        ),
      )
      return { valid: false, reason: 'missing', steps: [...steps, ...skipRest(3)] }
    }
    identifier = req.uid
    steps.push(
      step(
        2,
        'Obtain the UID out of band',
        'ok',
        [
          ['uid (u)', identifier],
          ['platform (p)', platform],
        ],
        'Not read from chain. Section 9 leaves the channel out of scope.',
      ),
    )
  }

  // --- Step 3: read and decode the envelope ---
  const recordKey =
    req.mode === 'handle'
      ? handleAttestationRecordKey(platform, attesterEns)
      : uidAttestationRecordKey(platform, attesterEns)

  const envRead = await read(() => getEnsText(client, { name, key: recordKey }))
  if (!envRead.ok) {
    steps.push(step(3, LABELS[3], 'fail', [['record key', recordKey], rpcRow], envRead.error))
    return { valid: false, reason: 'rpc-error', steps: [...steps, ...skipRest(4)] }
  }
  if (!envRead.value) {
    steps.push(
      step(
        3,
        LABELS[3],
        'fail',
        [['record key', recordKey]],
        'No envelope at this key for this platform and attester.',
      ),
    )
    return { valid: false, reason: 'missing', steps: [...steps, ...skipRest(4)] }
  }

  const envHex = envRead.value
  let envelope: Envelope
  try {
    envelope = decodeEnvelope(hexToBytes(envHex as Hex))
  } catch (err) {
    steps.push(
      step(
        3,
        LABELS[3],
        'fail',
        [
          ['record key', recordKey],
          ['raw', envHex],
        ],
        err instanceof Error ? err.message : 'Envelope failed to decode.',
      ),
    )
    return { valid: false, reason: 'decode-error', steps: [...steps, ...skipRest(4)] }
  }

  steps.push(
    step(3, LABELS[3], 'ok', [
      ['record key', recordKey],
      ['envelope', envHex],
      ['version', String(envelope.version)],
      [
        'issuedAt (t)',
        `${envelope.issuedAt} — ${new Date(envelope.issuedAt * 1000).toISOString()}`,
      ],
      ['signature', envelope.sig],
    ]),
  )

  const handoff: Handoff = {
    mode: req.mode,
    envelopeHex: envHex,
    name,
    addr: owner,
    platform,
    identifier,
    issuedAt: envelope.issuedAt,
  }

  // --- Step 4: reconstruct the payload ---
  const common = { name, addr: owner, platform, issuedAt: envelope.issuedAt }
  let payload: Uint8Array
  try {
    payload =
      req.mode === 'handle'
        ? encodeHandlePayload({ ...common, handle: identifier })
        : encodeUidPayload({ ...common, uid: identifier })
  } catch (err) {
    steps.push(
      step(
        4,
        LABELS[4],
        'fail',
        [],
        err instanceof Error ? err.message : 'Payload encoding failed.',
      ),
    )
    return { valid: false, reason: 'decode-error', steps: [...steps, ...skipRest(5)], handoff }
  }
  steps.push(
    step(4, LABELS[4], 'ok', [
      ['map keys', req.mode === 'handle' ? 'n, a, p, h, t' : 'n, a, p, u, t'],
      ['bytes', bytesToHex(payload)],
      ['length', `${payload.length} bytes`],
    ]),
  )

  // --- Step 5: hash and recover ---
  const digest = keccak256(payload)
  let recovered: Address
  try {
    recovered = await recoverMessageAddress({ message: { raw: digest }, signature: envelope.sig })
  } catch (err) {
    steps.push(
      step(
        5,
        LABELS[5],
        'fail',
        [['digest', digest]],
        err instanceof Error ? err.message : 'ecrecover failed.',
      ),
    )
    return { valid: false, reason: 'bad-signature', steps: [...steps, ...skipRest(6)], handoff }
  }
  steps.push(
    step(
      5,
      LABELS[5],
      'ok',
      [
        ['keccak256(payload)', digest],
        ['recovered signer', recovered],
      ],
      'Signed with EIP-191, so the digest is wrapped before recovery.',
    ),
  )

  // --- Step 6: resolve the attester's address ---
  const attesterRead = await read(() => getEnsAddress(client, { name: normalize(attesterEns) }))
  if (!attesterRead.ok) {
    steps.push(step(6, LABELS[6], 'fail', [['attester', attesterEns], rpcRow], attesterRead.error))
    return { valid: false, reason: 'rpc-error', steps: [...steps, ...skipRest(7)], handoff }
  }
  const attesterAddress = attesterRead.value
  if (!attesterAddress || !isAddress(attesterAddress)) {
    steps.push(
      step(
        6,
        LABELS[6],
        'fail',
        [['attester', attesterEns]],
        'No addr record. Nothing signed under this name can be verified until the ENS is fixed.',
      ),
    )
    return {
      valid: false,
      reason: 'attester-not-resolved',
      steps: [...steps, ...skipRest(7)],
      handoff,
    }
  }
  steps.push(
    step(6, LABELS[6], 'ok', [
      ['attester', attesterEns],
      ['expected address', attesterAddress],
    ]),
  )
  handoff.expectedAttester = attesterAddress

  // --- Step 7: compare ---
  const valid = recovered.toLowerCase() === attesterAddress.toLowerCase()
  steps.push(
    step(
      7,
      LABELS[7],
      valid ? 'ok' : 'fail',
      [
        ['recovered', recovered],
        ['expected', attesterAddress],
      ],
      valid
        ? undefined
        : 'A mismatch means the reconstruction differs from what was signed, or a different key signed it. Section 8 lists the causes.',
    ),
  )

  return { valid, ...(valid ? {} : { reason: 'bad-signature' }), steps, handoff }
}

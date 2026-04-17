import {
  INTENT_EIP712_DOMAIN,
  INTENT_EIP712_TYPES,
  type IntentConfig,
  hashConfig,
  validateIntentConfig,
} from '@ensmetadata/shared/intent'
import { nanoid } from 'nanoid'
import { http, type Hex, createPublicClient, isAddress, recoverTypedDataAddress } from 'viem'
import { mainnet } from 'viem/chains'
import { jsonResponse } from '../cors'
import type { Env } from '../env'

// Replay window for the EIP-712 signature: 60s of backward skew (client
// clock ahead of ours) up to 15min forward — long enough to sign + submit,
// short enough to limit stale-signature reuse.
const SKEW_BACKWARD_MS = 60_000
const MAX_FORWARD_MS = 15 * 60 * 1000
const ID_LENGTH = 10
const MAX_COLLISION_RETRIES = 3

interface StoredIntent {
  creator: { address: string; ensName: string }
  config: IntentConfig
  signature: string
  signedAt: number
  expiry: number
}

// Module-scoped so repeat invocations in the same isolate reuse the same
// client. Keyed on the RPC URL so a config change rebuilds it.
let cachedClient: ReturnType<typeof createPublicClient> | null = null
let cachedRpc: string | null = null

function ensClient(env: Env) {
  if (!env.ENS_RPC_URL) {
    throw new Error('ENS_RPC_URL missing — cannot resolve reverse record')
  }
  if (cachedClient && cachedRpc === env.ENS_RPC_URL) return cachedClient
  cachedRpc = env.ENS_RPC_URL
  cachedClient = createPublicClient({
    chain: mainnet,
    transport: http(env.ENS_RPC_URL),
  })
  return cachedClient
}

/**
 * POST /api/intent
 *
 * Body: { address, ensName, config, signature, expiry }
 *
 * Verifies the EIP-712 signature, independently confirms the reverse record
 * (`getEnsName(address)` must equal `ensName`), and writes the intent to KV
 * under a random short id. Returns `{ id }`; the caller composes its own
 * share URL using its origin.
 */
export async function handleCreateIntent(env: Env, request: Request): Promise<Response> {
  let body: {
    address?: unknown
    ensName?: unknown
    config?: unknown
    signature?: unknown
    expiry?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return jsonResponse(env, request, { error: 'invalid_json' }, { status: 400 })
  }

  const { address, ensName, signature, expiry } = body
  if (typeof address !== 'string' || !isAddress(address)) {
    return jsonResponse(env, request, { error: 'invalid_address' }, { status: 400 })
  }
  if (typeof ensName !== 'string' || ensName.length === 0) {
    return jsonResponse(env, request, { error: 'invalid_ens_name' }, { status: 400 })
  }
  if (typeof signature !== 'string' || !signature.startsWith('0x')) {
    return jsonResponse(env, request, { error: 'invalid_signature' }, { status: 400 })
  }
  if (typeof expiry !== 'number' || !Number.isFinite(expiry)) {
    return jsonResponse(env, request, { error: 'invalid_expiry' }, { status: 400 })
  }

  const now = Date.now()
  if (expiry < now - SKEW_BACKWARD_MS || expiry > now + MAX_FORWARD_MS) {
    return jsonResponse(env, request, { error: 'clock_skew' }, { status: 400 })
  }

  const validation = validateIntentConfig(body.config)
  if (!validation.ok) {
    return jsonResponse(
      env,
      request,
      { error: 'invalid_config', field: validation.error.field },
      { status: 400 },
    )
  }
  const config = validation.value

  const configHash = hashConfig(config)
  let recovered: string
  try {
    recovered = await recoverTypedDataAddress({
      domain: INTENT_EIP712_DOMAIN,
      types: INTENT_EIP712_TYPES,
      primaryType: 'Intent',
      message: { configHash, ensName, expiry: BigInt(expiry) },
      signature: signature as Hex,
    })
  } catch {
    return jsonResponse(env, request, { error: 'bad_signature' }, { status: 400 })
  }
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return jsonResponse(env, request, { error: 'signer_mismatch' }, { status: 400 })
  }

  // Independent on-chain check: the signer actually has this primary name.
  // Defense in depth; the identity app gates this client-side too.
  let primary: string | null
  try {
    primary = await ensClient(env).getEnsName({ address: address as Hex })
  } catch {
    return jsonResponse(env, request, { error: 'ens_lookup_failed' }, { status: 502 })
  }
  if (!primary || primary.toLowerCase() !== ensName.toLowerCase()) {
    return jsonResponse(env, request, { error: 'ens_not_primary' }, { status: 409 })
  }

  const stored: StoredIntent = {
    creator: { address: address.toLowerCase(), ensName: primary },
    config,
    signature,
    signedAt: now,
    expiry,
  }

  // KV has no atomic NX; GET-then-PUT with retry. With a ~6e17 id space the
  // collision probability is astronomical — this is belt-and-suspenders.
  let id: string | null = null
  try {
    for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
      const candidate = nanoid(ID_LENGTH)
      const existing = await env.INTENTS.get(`intent:${candidate}`)
      if (existing === null) {
        await env.INTENTS.put(`intent:${candidate}`, JSON.stringify(stored))
        id = candidate
        break
      }
    }
  } catch (err) {
    console.error('intent: kv write failed', err)
    return jsonResponse(env, request, { error: 'kv_unavailable' }, { status: 502 })
  }
  if (!id) {
    return jsonResponse(env, request, { error: 'kv_collision' }, { status: 500 })
  }

  return jsonResponse(env, request, { id })
}

/**
 * GET /api/intent/:id
 *
 * Returns the stored config plus the creator's ENS name + best-effort avatar.
 * 404 when the id is unknown. Signature + expiry are intentionally stripped
 * from the public read — they're audit-only.
 */
export async function handleGetIntent(env: Env, request: Request, id: string): Promise<Response> {
  if (!id || id.length > 32) {
    return jsonResponse(env, request, { error: 'invalid_id' }, { status: 400 })
  }

  let raw: string | null
  try {
    raw = await env.INTENTS.get(`intent:${id}`)
  } catch {
    return jsonResponse(env, request, { error: 'kv_unavailable' }, { status: 502 })
  }
  if (raw === null) {
    return jsonResponse(env, request, { error: 'not_found' }, { status: 404 })
  }

  let stored: StoredIntent
  try {
    stored = JSON.parse(raw) as StoredIntent
  } catch {
    return jsonResponse(env, request, { error: 'corrupt' }, { status: 500 })
  }

  // Avatar is best-effort — a failure must not mask the intent fetch itself,
  // the banner falls back to an initial in the UI.
  let avatar: string | null = null
  try {
    avatar = (await ensClient(env).getEnsAvatar({ name: stored.creator.ensName })) ?? null
  } catch {
    avatar = null
  }

  return jsonResponse(env, request, {
    id,
    config: stored.config,
    creator: {
      address: stored.creator.address,
      ensName: stored.creator.ensName,
      avatar,
    },
  })
}

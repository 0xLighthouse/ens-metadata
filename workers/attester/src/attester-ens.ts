import {
  BASE_DEFAULT_ATTESTER_ENS,
  DEFAULT_ATTESTER_ENS,
  defaultAttesterEnsForName,
} from '@ensmetadata/sdk'
import { chainForName } from '@ensmetadata/shared/chain-for-name'
import type { Env } from './env'

/**
 * Pick the attester ENS label used in v2 record keys for `name`. The signing
 * key is shared across labels — only the ENS embedded in the record key
 * differs, so verifiers resolve the right address on the right chain.
 *
 *   *.base.eth → env.ATTESTER_ENS_BASE ?? SDK default ('atst.base.eth')
 *   everything else → env.ATTESTER_ENS ?? SDK default ('atst.lighthousegov.eth')
 */
export function attesterEnsForName(name: string, env: Env): string {
  const sdkDefault = defaultAttesterEnsForName(name)
  if (chainForName(name).name === 'base') return env.ATTESTER_ENS_BASE ?? sdkDefault
  return env.ATTESTER_ENS ?? sdkDefault
}

/**
 * Discovery map advertised by `GET /` — keys are the chain slugs from the
 * shared chain registry so identity clients can resolve via
 * `chainForName(name).name`.
 */
export function attesterEnsMap(env: Env): Record<string, string> {
  return {
    mainnet: env.ATTESTER_ENS ?? DEFAULT_ATTESTER_ENS,
    base: env.ATTESTER_ENS_BASE ?? BASE_DEFAULT_ATTESTER_ENS,
  }
}

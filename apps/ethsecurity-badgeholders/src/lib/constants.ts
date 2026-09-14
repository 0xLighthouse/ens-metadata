/**
 * ETHSecurity Badge (BADGE), an ERC-721 on Ethereum mainnet behind an EIP-1967 proxy.
 * This is the proxy address — never key on an implementation address. One token is one
 * badgeholder. The contract is not ERC721Enumerable (`totalSupply()` reverts), so the
 * badgeholder set cannot be walked on-chain and comes from Dune instead.
 */
export const BADGE_CONTRACT_ADDRESS = '0xf67C0aDe41c607EfeBf198F9D6065Ab1ec5aD4cd'

/**
 * Default Dune query listing the current ETHSecurity badgeholders:
 * https://dune.com/queries/8607855. Override it with `DUNE_BADGELIST_QUERY_ID`; read the
 * effective id through `badgeholdersDuneQueryId()` in `@/lib/env`, never this constant.
 *
 * Any query used must return one row per badge with columns `owner` (varbinary, returned as
 * lowercase hex), `tokenId` (uint256, returned as a decimal string) and `issuedAt` (timestamp,
 * the block time the current holder received the badge).
 */
export const DEFAULT_BADGEHOLDERS_DUNE_QUERY_ID = 8607855

/** How long a badgeholder list is cached, in seconds. The set changes rarely. */
export const BADGEHOLDERS_CACHE_TTL_SECONDS = 60 * 60

/** Base URL of the rcrds.xyz read API: https://rcrds.xyz/v1/docs */
export const RCRDS_API_URL = 'https://rcrds.xyz/v1'

/**
 * Names per `POST /v1/names` call. `format=json` caps a batch at 50 regardless of the key's
 * `max_names`; larger batches need `format=ndjson` and line parsing.
 */
export const RCRDS_BATCH_SIZE = 50

/**
 * Mainnet address of `DEFAULT_ATTESTER_ENS` (atst.lighthousegov.eth), the only attester whose
 * handle attestations count as verified. Pinned so verification needs no name resolution.
 */
export const ATTESTER_ADDRESS = '0xf82A259381f5632A0b12E6720C8C216B7c659783'

/**
 * Pixels requested from stamp.fyi for every badgeholder avatar. One size for every surface keeps
 * a single cached image per address; 96 covers the list thumbnails at their rendered 48px and is
 * upscaled on the profile page, which is an accepted trade for the smaller list payload.
 *
 * Must stay within 1..500: stamp resets an out-of-range `s` to 64 rather than clamping it.
 */
export const AVATAR_SIZE = 96

/** How long a cached avatar is served before Next revalidates it upstream, in seconds. */
export const AVATAR_CACHE_TTL_SECONDS = 60 * 60 * 12

/**
 * How long a browser may reuse an avatar, in seconds. Deliberately short: an on-demand refresh
 * clears our cache but cannot reach a browser that already holds the image, so this bounds how
 * long a stale avatar can linger on screen.
 */
export const AVATAR_BROWSER_TTL_SECONDS = 5 * 60

/** How long a browser may serve a stale avatar while refetching in the background, in seconds. */
export const AVATAR_STALE_TTL_SECONDS = 60 * 60 * 24

/** Next data-cache tag on every rcrds.xyz profile batch, so a publish can drop them all at once. */
export const BADGEHOLDER_PROFILES_CACHE_TAG = 'esb-badgeholder-profiles'

/** Base URL of the attester worker that signs X and Telegram handle attestations. */
export const ATTESTER_URL = process.env.NEXT_PUBLIC_ATTESTER_URL ?? 'http://localhost:8787'

/** Optional mainnet RPC override for live record reads and publishing. */
export const MAINNET_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL

/** The `class` record every edited profile carries. */
export const PERSON_CLASS = 'Person'

/**
 * The `schema` record every edited profile carries: the latest published Person schema,
 * from `packages/schemas/published/_latest.json`. `PERSON_SCHEMA` in `@/lib/person-schema`
 * must be the document this CID resolves to.
 */
export const PERSON_SCHEMA_URI = 'ipfs://QmSHkLhbPF96jYwYq52TmmvQNSCFijhZWYziRqgimBQ9Na'

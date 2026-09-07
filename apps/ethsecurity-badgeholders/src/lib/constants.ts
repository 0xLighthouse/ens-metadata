/**
 * ETHSecurity Badge (BADGE), an ERC-721 on Ethereum mainnet behind an EIP-1967 proxy.
 * This is the proxy address — never key on an implementation address. One token is one
 * badgeholder. The contract is not ERC721Enumerable (`totalSupply()` reverts), so the
 * badgeholder set cannot be walked on-chain and comes from Dune instead.
 */
export const BADGE_CONTRACT_ADDRESS = '0xf67C0aDe41c607EfeBf198F9D6065Ab1ec5aD4cd'

/**
 * Dune query listing the current ETHSecurity badgeholders: https://dune.com/queries/8607855
 * One row per badge with columns `owner` (varbinary, returned as lowercase hex), `tokenId`
 * (uint256, returned as a decimal string) and `issuedAt` (timestamp, the block time the
 * current holder received the badge).
 */
export const BADGEHOLDERS_DUNE_QUERY_ID = 8607855

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

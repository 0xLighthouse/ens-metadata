/**
 * ETHSecurity Badge (BADGE), an ERC-721 on Ethereum mainnet behind an EIP-1967 proxy.
 * This is the proxy address — never key on an implementation address. One token is one
 * badgeholder. The contract is not ERC721Enumerable (`totalSupply()` reverts), so the
 * badgeholder set cannot be walked on-chain and comes from Dune instead.
 */
export const BADGE_CONTRACT_ADDRESS = '0xf67C0aDe41c607EfeBf198F9D6065Ab1ec5aD4cd'

/** Dune query listing the current ETHSecurity badgeholders: https://dune.com/queries/8607855 */
export const BADGEHOLDERS_DUNE_QUERY_ID = 8607855

/** How long a badgeholder list is cached, in seconds. The set changes rarely. */
export const BADGEHOLDERS_CACHE_TTL_SECONDS = 60 * 60

/**
 * Column names accepted as the badgeholder address, matched case-insensitively in this
 * order. The Dune query's real column names were not readable from the environment this
 * was written in, so the mapping accepts the plausible spellings rather than guessing one.
 * Once the query's schema is confirmed, narrow this to the single name it returns.
 */
export const BADGEHOLDER_ADDRESS_COLUMNS = [
  'address',
  'holder',
  'holder_address',
  'owner',
  'owner_address',
  'wallet',
  'wallet_address',
  'badgeholder',
] as const

/** Column names accepted as the badge token id, matched case-insensitively in this order. */
export const BADGEHOLDER_TOKEN_ID_COLUMNS = ['token_id', 'tokenid', 'id'] as const

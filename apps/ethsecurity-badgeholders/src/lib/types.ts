/**
 * One holder of the ETHSecurity badge. `address` is always lowercase. `issuedAt` is an ISO 8601
 * UTC timestamp of the block in which the holder received the badge. Later phases key on `address`.
 */
export type Badgeholder = {
  address: string
  tokenId: string
  issuedAt: string
}

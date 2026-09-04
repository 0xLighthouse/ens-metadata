/**
 * One holder of the ETHSecurity badge. `address` is always lowercase. `tokenId` is present
 * only when the Dune query exposes a token id column; later phases key on `address`.
 */
export type Badgeholder = {
  address: string
  tokenId?: string
}

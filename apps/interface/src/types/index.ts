export interface ENSRootDomain {
  /**
   * The ID of the domain
   */
  id: string

  /**
   * The name of the domain (e.g. "ens.eth")
   */
  name: string

  /**
   * The label name of the domain "ens.eth"
   */
  label: string

  /**
   * The namehash of the domain (i.e keccak256(name))
   */
  namehash: string

  /**
   * Timestamp of when the domain was created "1664886275"
   */
  createdAt: string

  /**
   * Timestamp of when the domain expires "1919611283"
   */
  expiryDate: string

  /**
   * Whether the domain is migrated "true"
   */
  isMigrated: boolean

  /**
   * The label name of the domain "stdlib"
   */
  // :
  // true
  // labelName
  // :
  // "stdlib"
  // labelhash
  // :
  // "0x8ff37cb31c9a317cc3f68fbd8edac677adda84983e1b34651be1794fc3770644"
  // name
  // :
  // "stdlib.eth"
  // owner
  // :
  // {id: '0x6837047f46da1d5d9a79846b25810b92adf456f6'}
  // ownerId
  // :
  // "0x6837047f46da1d5d9a79846b25810b92adf456f6"
  // parentId
  // :
  // "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae"
  // registrantId
  // :
  // "0x6837047f46da1d5d9a79846b25810b92adf456f6"
  // resolvedAddress
  // :
  // {__typename: 'Account', id: '0x6837047f46da1d5d9a79846b25810b92adf456f6'}
  // resolvedAddressId
  // :
  // "0x6837047f46da1d5d9a79846b25810b92adf456f6"
  // resolverId
  // :
  // "1-0x231b0ee14048e9dccd1d247744d114a4eb5e8e63-0x17e0294c456f2e49fa57dfca57f409373e8f1fef19152c04cfbe12c7f4ea94fe"
  // subdomainCount
  // :
  // 0
  // ttl
  // :
  // null
  // wrappedOwnerId
  // :
  // null
  // __typename
  // :
  // "Domain"
}

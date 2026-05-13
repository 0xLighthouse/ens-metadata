// --- Core (single-chain) ---
export { metadataReader } from './read'
export { metadataWriter, metadataEstimator } from './write'

// --- Routing primitives ---
export {
  chainForName,
  MissingChainClientError,
  type SupportedChain,
  type ChainClients,
  type ChainWalletClients,
} from './multichain/routing'

// --- Multichain wrappers ---
export {
  multichainMetadataReader,
  multichainMetadataWriter,
  multichainMetadataEstimator,
  multichainAttestationVerifier,
  verifyHandleAttestation,
  verifyUidAttestation,
  handleAttestationRecordKey,
  uidAttestationRecordKey,
  DEFAULT_ATTESTER_ENS,
  type MultichainAttestationVerifierConfig,
  type AttestationVerifierConfig,
} from './multichain'

// --- Chain helpers (Base) ---
export {
  isBasename,
  getBaseResolverAddress,
  getBaseRegistryOwner,
  getOrCreateBasePublicClient,
  BaseResolverError,
  BASE_CHAIN_ID,
  BASE_REGISTRY,
} from './chains/base'

// --- Low-level chain-agnostic primitives ---
export { fetchTextRecordsDirect } from './multichain'

// --- Schema fetch / resolve ---
export {
  fetchSchema,
  fetchSchemaFromHttps,
  fetchSchemaFromIpfs,
  fetchSchemaFromLocal,
  getSchemaKeys,
  DEFAULT_IPFS_GATEWAY,
  type SchemaResolver,
} from './schema'

// --- Validation + delta ---
export { validateMetadataSchema, validate } from './schema'
export { computeDelta, hasChanges } from './delta'

// --- Attestation primitives (sign / verify-claim, encoding) ---
export {
  encodeHandlePayload,
  encodeUidPayload,
  encodeEnvelope,
  decodeEnvelope,
  signHandleClaim,
  signUidClaim,
  verifyHandleClaim,
  verifyUidClaim,
  CLAIM_VERSION,
  ENVELOPE_TAG,
} from './attestation'

// --- Public types ---
export type {
  GetSchemaOptions,
  GetMetadataOptions,
  GetMetadataResult,
  MetadataValidationError,
  MetadataValidationResult,
  MetadataDelta,
  ComputeDeltaOptions,
  SetMetadataOptions,
  ModifyExistingMetadataOptions,
  ApplyDeltaOptions,
  SetMetadataResult,
  PrepareSetMetadataOptions,
  ChangePreview as PrepareResult,
  EstimateSetMetadataOptions,
  EstimateModifyExistingMetadataOptions,
  EstimateResult,
} from './types'

export type {
  Envelope,
  HandlePayloadFields,
  UidPayloadFields,
  SignHandleClaimInput,
  SignUidClaimInput,
  VerifyHandleClaimOptions,
  VerifyUidClaimOptions,
  VerifyClaimResult,
  VerifyFailureReason,
  VerifyHandleAttestationOptions,
  VerifyUidAttestationOptions,
  VerifyResult,
} from './attestation-types'

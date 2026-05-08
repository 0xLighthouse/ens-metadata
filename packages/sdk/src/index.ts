export { metadataReader } from './read'
export {
  readTextRecords,
  readTextRecordsStrict,
  readTextRecordsFromResolver,
  getResolverAddress,
  getResolverAddressStrict,
  type ReadTextRecordsOptions,
  type ReadTextRecordsFromResolverOptions,
  type GetResolverAddressOptions,
} from './read-helpers'
export {
  extractSchemaFields,
  isBasename,
  getBaseResolverAddress,
  getBaseRegistryOwner,
  getResolverForName,
  fetchTextRecordsDirect,
  fetchAddrDirect,
  BaseResolverError,
  BASE_CHAIN_ID,
  BASE_REGISTRY,
} from './internal'
export {
  parseSchemaUri,
  fetchSchemaByUri,
  DEFAULT_IPFS_GATEWAY,
  type SchemaFetcherOptions,
} from './schema-fetch'
export {
  resolveSchemaForName,
  type ResolveSchemaOptions,
  type ResolvedSchema,
  type SchemaSource,
} from './schema-resolve'
export { validateMetadataSchema, validate } from './validate'
export { computeDelta, hasChanges } from './delta'
export { metadataWriter, metadataEstimator, MetadataWriteError } from './write'
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
export {
  attestationVerifier,
  verifyHandleAttestation,
  verifyUidAttestation,
  handleAttestationRecordKey,
  uidAttestationRecordKey,
  DEFAULT_ATTESTER_ENS,
  type AttestationVerifierConfig,
} from './verify'

export type {
  GetSchemaOptions,
  GetSchemaResult,
  GetMetadataOptions,
  GetMetadataResult,
  MetadataValidationError,
  MetadataValidationResult,
  MetadataDelta,
  ComputeDeltaOptions,
  SetMetadataOptions,
  ApplyDeltaOptions,
  SetMetadataResult,
  PrepareSetMetadataOptions,
  PrepareResult,
  EstimateSetMetadataOptions,
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

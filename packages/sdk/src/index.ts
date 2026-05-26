// --- Core ---
export { metadataReader } from './read'
export { metadataWriter, metadataEstimator, MetadataValidationFailedError } from './write'

// --- Schema fetch / resolve ---
export {
  fetchSchema,
  fetchSchemaFromHttps,
  fetchSchemaFromIpfs,
  fetchSchemaFromLocal,
  getSchemaKeys,
  matchArrayEntry,
  DEFAULT_IPFS_GATEWAY,
  type SchemaResolver,
  type ArrayPatternKey,
} from './schema'

// --- Validation + delta ---
export { validateMetadata, validate } from './schema'
export { computeDelta, hasChanges } from './delta'

// --- Hydrate / flatten helpers (array-pattern shape conversions) ---
export { flatten, unflatten, type HydratedRecordSet } from './hydrate'

// --- Attestation primitives (sign / verify-claim, encoding, record keys) ---
export {
  encodeHandlePayload,
  encodeUidPayload,
  encodeEnvelope,
  decodeEnvelope,
  signHandleClaim,
  signUidClaim,
  verifyHandleClaim,
  verifyUidClaim,
  handleAttestationRecordKey,
  uidAttestationRecordKey,
  CLAIM_VERSION,
  ENVELOPE_TAG,
  DEFAULT_ATTESTER_ENS,
  BASE_DEFAULT_ATTESTER_ENS,
  defaultAttesterEnsForName,
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
  SetMetadataResult,
  ChangePreview,
  PreparedMetadata,
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
} from './attestation-types'

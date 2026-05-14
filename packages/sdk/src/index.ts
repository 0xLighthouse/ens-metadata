// --- Core ---
export { metadataReader } from './read'
export { metadataWriter, metadataEstimator } from './write'

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

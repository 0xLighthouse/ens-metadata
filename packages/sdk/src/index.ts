export { metadataReader } from './read'
export { validateMetadataSchema, validate } from './validate'
export { computeDelta, hasChanges } from './delta'
export { metadataWriter, MetadataWriteError } from './write'
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

export { metadataReader } from './read'
export { validateMetadataSchema, validate } from './validate'
export { computeDelta, hasChanges } from './delta'
export { metadataWriter, MetadataWriteError } from './write'
export {
  encodePayload,
  decodePayload,
  encodeEnvelope,
  decodeEnvelope,
  signClaim,
  verifyClaim,
  CLAIM_VERSION,
  ENVELOPE_TAG,
} from './proof'
export {
  proofVerifier,
  verifyProof,
  type ProofVerifierConfig,
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
  PayloadFields,
  Envelope,
  SignClaimInput,
  VerifyClaimOptions,
  VerifyClaimResult,
  VerifyFailureReason,
  VerifyProofOptions,
  VerifyResult,
} from './proof-types'

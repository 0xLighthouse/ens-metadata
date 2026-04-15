export { metadataReader } from './read'
export { validateMetadataSchema, validate } from './validate'
export { computeDelta, hasChanges } from './delta'
export { metadataWriter, MetadataWriteError } from './write'
export { encodeClaim, decodeClaim, hashClaim, signClaim, verifyClaim } from './proof'
export {
  proofVerifier,
  verifyProof,
  fetchAndVerifyFullProof,
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
  ClaimFields,
  ClaimWithoutSig,
  Claim,
  VerifyClaimResult,
  VerifyFailureReason,
  VerifyProofOptions,
  VerifyResult,
  FullVerifyResult,
} from './proof-types'

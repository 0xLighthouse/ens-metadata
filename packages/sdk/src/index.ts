export { metadataReader } from './read'
export { validateMetadataSchema, validate } from './validate'
export { computeDelta, hasChanges } from './delta'
export { metadataWriter, MetadataWriteError } from './write'

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

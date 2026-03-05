import { SCHEMA_8004_V2 } from './types.js'

export type { AgentRegistrationFile } from './types.js'
export { SCHEMA_8004_V2 } from './types.js'

export function validateRegistrationFile(file: unknown) {
  return SCHEMA_8004_V2.safeParse(file)
}

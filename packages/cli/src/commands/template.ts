import { SCHEMA_MAP } from '@ensmetadata/schemas'
import { z } from 'zod'

export const templateCommand = {
  description: 'Generate starter ENS metadata payload template',
  args: z.object({}),
  options: z.object({}),
  run() {
    return SCHEMA_MAP.Agent
  },
}

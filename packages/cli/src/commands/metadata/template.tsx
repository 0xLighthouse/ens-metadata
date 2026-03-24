import { Text } from 'ink'
import React from 'react'

import { SCHEMA_MAP } from '@ensmetadata/schemas'

export const description = 'Generate starter ENS metadata payload template'

export default function MetadataTemplate() {
  return <Text>{JSON.stringify(SCHEMA_MAP.Agent, null, 2)}</Text>
}

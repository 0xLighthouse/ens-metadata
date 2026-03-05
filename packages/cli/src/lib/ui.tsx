import { Box, Text } from 'ink'
import React from 'react'
import type { ZodIssue } from 'zod'

export function ZodIssueList({ issues }: { issues: ZodIssue[] }) {
  return (
    <>
      {issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
        return (
          <Box key={`${path}.${issue.message}`}>
            <Text color="red">
              {'  '}[{path}] {issue.message}
            </Text>
          </Box>
        )
      })}
    </>
  )
}

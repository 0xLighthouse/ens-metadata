import { Box, Text, useApp } from 'ink'
import React from 'react'

export type CommandState =
  | { status: 'idle' }
  | { status: 'working'; message: string }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string }

/**
 * Manages command lifecycle: state machine, exit-on-terminal, and async execution.
 *
 * @param deps - React effect dependency array (re-runs when these change)
 * @param runFn - Async function that drives state via the provided setState
 */
export function useCommand(
  deps: React.DependencyList,
  runFn: (setState: React.Dispatch<React.SetStateAction<CommandState>>) => Promise<void>,
) {
  const { exit } = useApp()
  const [state, setState] = React.useState<CommandState>({ status: 'idle' })

  React.useEffect(() => {
    if (state.status === 'done') exit()
    else if (state.status === 'error') exit(new Error(state.message))
  }, [state, exit])

  React.useEffect(() => {
    runFn(setState)
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}

/** Color-coded status display for command output. */
export function CommandStatus({ state }: { state: CommandState }) {
  return (
    <Box flexDirection="column">
      {state.status === 'idle' && <Text color="gray">Preparing…</Text>}
      {state.status === 'working' && <Text color="cyan">{state.message}</Text>}
      {state.status === 'done' && <Text color="green">{state.message}</Text>}
      {state.status === 'error' && <Text color="red">❌ {state.message}</Text>}
    </Box>
  )
}

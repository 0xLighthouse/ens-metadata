#!/usr/bin/env node
import Pastel from 'pastel'

const args = process.argv.slice(2)
const isRootHelp =
  args.length === 0 || (args.length === 1 && (args[0] === '--help' || args[0] === '-h'))

if (isRootHelp) {
  console.log(`
CLI for registering AI agents on ENS using ERC-8004 (v2.0).

Usage:
  ens-metadata skill

  ens-metadata registration-file template
  ens-metadata registration-file validate <file.json>
  ens-metadata registration-file publish <file.json>

  ens-metadata registry identity                       (show sub-commands)
  ens-metadata registry identity query                  --chain-name <chain> <agent-id>
  ens-metadata registry identity register               --chain-name <chain> <agent-uri> --private-key <0x...> [--broadcast]
  ens-metadata registry identity set-uri                --chain-name <chain> <agent-id> <new-uri> --private-key <0x...> [--broadcast]
  ens-metadata registry identity set-wallet             --chain-name <chain> <agent-id> <wallet> --private-key <0x...> [--deadline <ts>] [--signature <0x...>] [--broadcast]
  ens-metadata registry identity unset-wallet           --chain-name <chain> <agent-id> --private-key <0x...> [--broadcast]

  ens-metadata metadata view <ENS name>
  ens-metadata metadata template
  ens-metadata metadata validate <payload.json>
  ens-metadata metadata set <ens-node> <payload.json> --private-key <key> [--broadcast]

Run \`ens-metadata <command> --help\` for details on a specific command.
`)
  process.exit(0)
}

const app = new Pastel({
  importMeta: import.meta,
})

await app.run()

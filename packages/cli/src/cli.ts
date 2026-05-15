#!/usr/bin/env node
import { Cli } from 'incur'
import { publishCommand as agentRegFilePublish } from './commands/agent/registration-file/publish.js'
import { templateCommand as agentRegFileTemplate } from './commands/agent/registration-file/template.js'
import { validateCommand as agentRegFileValidate } from './commands/agent/registration-file/validate.js'
import { queryCommand as agentRegistryQuery } from './commands/agent/registry/query.js'
import { registerCommand as agentRegistryRegister } from './commands/agent/registry/register.js'
import { setUriCommand as agentRegistrySetUri } from './commands/agent/registry/set-uri.js'
import { setWalletCommand as agentRegistrySetWallet } from './commands/agent/registry/set-wallet.js'
import { unsetWalletCommand as agentRegistryUnsetWallet } from './commands/agent/registry/unset-wallet.js'
import { verifyHandleCommand as attestationVerifyHandle } from './commands/attestation/verify/handle.js'
import { verifyUidCommand as attestationVerifyUid } from './commands/attestation/verify/uid.js'
import { setCommand, updateCommand } from './commands/set.js'
import { skillCommand } from './commands/skill.js'
import { templateCommand } from './commands/template.js'
import { validateCommand } from './commands/validate.js'
import { viewCommand } from './commands/view.js'

const attestationVerifyGroup = Cli.create('verify', {
  description: 'Verify social-handle and uid attestations added to ENS names',
})
  .command('handle', attestationVerifyHandle)
  .command('uid', attestationVerifyUid)

const attestationGroup = Cli.create('attestation', {
  description: 'Attestations added to ENS names',
}).command(attestationVerifyGroup)

const agentRegistrationFileGroup = Cli.create('registration-file', {
  description: 'Build, validate, and publish ERC-8004 v2.0 agent registration files',
})
  .command('template', agentRegFileTemplate)
  .command('validate', agentRegFileValidate)
  .command('publish', agentRegFilePublish)

const agentRegistryGroup = Cli.create('registry', {
  description: 'Interact with the on-chain ERC-8004 IdentityRegistry',
})
  .command('query', agentRegistryQuery)
  .command('register', agentRegistryRegister)
  .command('set-uri', agentRegistrySetUri)
  .command('set-wallet', agentRegistrySetWallet)
  .command('unset-wallet', agentRegistryUnsetWallet)

const agentGroup = Cli.create('agent', {
  description: 'Agent registration files and on-chain identity',
})
  .command(agentRegistrationFileGroup)
  .command(agentRegistryGroup)

const cli = Cli.create('ens-metadata', {
  description: 'CLI for managing metadata for ENS names',
})
  .command('view', viewCommand)
  .command('set', setCommand)
  .command('update', updateCommand)
  .command('validate', validateCommand)
  .command('template', templateCommand)
  .command(attestationGroup)
  .command(agentGroup)
  .command('skill', skillCommand)

cli.serve()

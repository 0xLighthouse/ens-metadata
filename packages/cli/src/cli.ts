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
import { setCommand as metadataSet } from './commands/metadata/set.js'
import { templateCommand as metadataTemplate } from './commands/metadata/template.js'
import { validateCommand as metadataValidate } from './commands/metadata/validate.js'
import { viewCommand as metadataView } from './commands/metadata/view.js'
import { skillCommand } from './commands/skill.js'

const metadataGroup = Cli.create('metadata', {
  description: 'View and write ERC-8004 metadata records on ENS names',
})
  .command('view', metadataView)
  .command('set', metadataSet)
  .command('validate', metadataValidate)
  .command('template', metadataTemplate)

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
  description: 'Agent lifecycle — registration files and on-chain identity',
})
  .command(agentRegistrationFileGroup)
  .command(agentRegistryGroup)

const cli = Cli.create('ens-metadata', {
  description: 'CLI for managing AI agent metadata on ENS using ERC-8004',
})
  .command(metadataGroup)
  .command(agentGroup)
  .command('skill', skillCommand)

cli.serve()

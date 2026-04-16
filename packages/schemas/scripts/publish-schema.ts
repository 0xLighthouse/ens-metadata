#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  arg,
  hasFlag,
  bumpVersion,
  loadSchema,
  hashSha256,
  readJson,
  writeJson,
  upsertPublished,
  toRepoPath,
  publishFile,
  buildEip712,
  maybeSign,
  type PublishedSchema,
} from './helpers/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packagesRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(packagesRoot, '..', '..')

const args = process.argv.slice(2)

const usage = () => {
  console.log(
    [
      'Usage: pnpm --filter @ensmetadata/schemas publish:schema -- --id <schemaId> [--bump patch|minor|major|x.y.z]',
      'Options:',
      '  --id, -i        Schema id (file base name in packages/schemas/src/schemas)',
      '  --bump, -b      Semver bump (patch|minor|major) or explicit version (optional)',
      '  --notes         Short note for run log',
      '  --provider      Publish provider: pinata|ipfs (default: auto)',
      '  --ipfs-cmd      IPFS publish command (default: "ipfs add -q")',
      '  --pinata-jwt    Pinata JWT (or PINATA_JWT)',
      '  --pinata-key    Pinata API key (or PINATA_API_KEY)',
      '  --pinata-secret Pinata API secret (or PINATA_API_SECRET)',
      '  --private-key  Hex private key for EIP-712 signing (or SCHEMA_PUBLISHER_PRIVATE_KEY)',
      '  --chain-id     Optional chain id for EIP-712 domain',
      '  --allow-unsigned  Allow publish without signature',
      '  --dry-run       Skip IPFS publish and write files with cid placeholder',
    ].join('\n'),
  )
}

const schemaIdRaw = arg(args, '--id', '-i')
if (!schemaIdRaw) {
  usage()
  process.exit(1)
}

const schemaId = schemaIdRaw.replace(/\.ts$/i, '')
const bumpRaw = arg(args, '--bump', '-b')
const bumpFlagUsed = args.includes('--bump') || args.includes('-b')
const notes = arg(args, '--notes')
const ipfsCmd = arg(args, '--ipfs-cmd') ?? process.env.IPFS_CMD ?? 'ipfs add -q'
const dryRun = hasFlag(args, '--dry-run')
const allowUnsigned = hasFlag(args, '--allow-unsigned')
const privateKey = arg(args, '--private-key') ?? process.env.SCHEMA_PUBLISHER_PRIVATE_KEY
const chainIdRaw = arg(args, '--chain-id') ?? process.env.SCHEMA_PUBLISHER_CHAIN_ID
const chainId = chainIdRaw ? Number(chainIdRaw) : undefined
if (bumpFlagUsed && !bumpRaw) {
  console.error('Missing --bump value. Use patch|minor|major or x.y.z.')
  process.exit(1)
}

if (!privateKey && !allowUnsigned) {
  console.error(
    'Missing signing key. Provide --private-key or SCHEMA_PUBLISHER_PRIVATE_KEY (or use --allow-unsigned).',
  )
  process.exit(1)
}

const pinataJwt = arg(args, '--pinata-jwt') ?? process.env.PINATA_JWT
const pinataKey = arg(args, '--pinata-key') ?? process.env.PINATA_API_KEY
const pinataSecret = arg(args, '--pinata-secret') ?? process.env.PINATA_API_SECRET
const providerArg = arg(args, '--provider') ?? process.env.SCHEMA_PUBLISHER_PROVIDER
const hasPinataCreds = Boolean(pinataJwt || (pinataKey && pinataSecret))
const provider = (providerArg ?? (hasPinataCreds ? 'pinata' : 'ipfs')) as 'pinata' | 'ipfs'
if (provider === 'pinata' && !hasPinataCreds && !dryRun) {
  console.error(
    'Pinata selected but credentials missing. Provide PINATA_JWT or PINATA_API_KEY/PINATA_API_SECRET.',
  )
  process.exit(1)
}

const schemaFile = path.join(packagesRoot, 'src', 'schemas', `${schemaId}.ts`)
if (!fs.existsSync(schemaFile)) {
  console.error(`Schema file not found: ${schemaFile}`)
  process.exit(1)
}

const fileText = fs.readFileSync(schemaFile, 'utf8')
const versionMatch =
  fileText.match(/version:\s*['"](\d+\.\d+\.\d+)['"]/) ??
  fileText.match(/_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/)
if (!versionMatch) {
  console.error(`Could not find version in ${schemaFile}`)
  process.exit(1)
}

const currentVersion = versionMatch[1]
const nextVersion = bumpRaw ? bumpVersion(currentVersion, bumpRaw) : currentVersion

const publishedRoot = path.join(packagesRoot, 'published')
const schemaRoot = path.join(publishedRoot, schemaId)
const registryPath = path.join(publishedRoot, '_registry.json')
const indexPath = path.join(schemaRoot, 'index.json')

const registryCheck = readJson(registryPath, { schemas: {} as Record<string, any> })
const publishedByRegistry = registryCheck.schemas?.[schemaId]?.published?.[nextVersion]
const indexCheck = readJson(indexPath, { published: [] as Array<any> })
const publishedByIndex = Array.isArray(indexCheck.published)
  ? indexCheck.published.some((entry) => entry?.version === nextVersion)
  : false
if (publishedByRegistry || publishedByIndex) {
  console.error(
    `Version ${nextVersion} for ${schemaId} is already published. Bump version or choose a new one.`,
  )
  process.exit(1)
}

if (bumpRaw && nextVersion !== currentVersion) {
  const updatedVersionLiteral = versionMatch[0].replace(currentVersion, nextVersion)
  const updatedText = fileText.replace(versionMatch[0], updatedVersionLiteral)
  fs.writeFileSync(schemaFile, updatedText)
}

const schema = await loadSchema(schemaFile)
schema.version = nextVersion

const timestamp = Math.floor(Date.now() / 1000)
const versionRoot = path.join(schemaRoot, 'versions', nextVersion)
const runsRoot = path.join(schemaRoot, 'runs', 'ipfs')

fs.mkdirSync(versionRoot, { recursive: true })
fs.mkdirSync(runsRoot, { recursive: true })

const schemaJsonPath = path.join(versionRoot, 'schema.json')
const schemaJson = JSON.stringify(schema, null, 2) + '\n'
fs.writeFileSync(schemaJsonPath, schemaJson, 'utf8')

const checksum = `sha256:${hashSha256(schemaJson)}`
fs.writeFileSync(path.join(versionRoot, 'checksum.sha256'), `${checksum}\n`, 'utf8')

const publishResult = dryRun
  ? { cid: 'dry-run', publisher: provider }
  : await publishFile({
      provider,
      filePath: schemaJsonPath,
      ipfsCmd,
      pinataJwt,
      pinataKey,
      pinataSecret,
      schemaId,
      version: nextVersion,
    })
const { cid, publisher } = publishResult
fs.writeFileSync(path.join(versionRoot, 'cid.txt'), `${cid}\n`, 'utf8')

const schemaPath = toRepoPath(schemaJsonPath, repoRoot)
const publishedEntry = {
  cid,
  checksum,
  timestamp,
  schemaPath,
}

const meta: PublishedSchema = {
  schemaId,
  version: nextVersion,
  title: schema.title,
  description: schema.description,
  source: schema.source,
  cid,
  checksum,
  timestamp,
  schemaPath,
  publisher,
  notes,
}
const eip712 = buildEip712(
  {
    schemaId,
    version: nextVersion,
    cid,
    checksum,
    timestamp,
    schemaPath,
    publisher,
    notes: notes ?? '',
  },
  chainId,
)
const signed = await maybeSign(eip712, privateKey)
if (signed) {
  meta.signer = signed.signer
  meta.signature = signed.signature
  meta.eip712 = eip712
}
writeJson(path.join(versionRoot, 'meta.json'), meta)

const run: PublishedSchema = {
  schemaId,
  version: nextVersion,
  cid,
  checksum,
  timestamp,
  schemaPath,
  publisher,
  notes,
}
if (signed) {
  run.signer = signed.signer
  run.signature = signed.signature
  run.eip712 = eip712
}
const runPath = path.join(runsRoot, `run-${timestamp}.json`)
writeJson(runPath, run)
writeJson(path.join(runsRoot, 'run-latest.json'), run)

const latestPath = path.join(publishedRoot, '_latest.json')

const registry = readJson(registryPath, { schemas: {} as Record<string, any> })
registry.schemas[schemaId] ??= { latest: nextVersion, published: {} }
registry.schemas[schemaId].latest = nextVersion
registry.schemas[schemaId].published[nextVersion] = publishedEntry
writeJson(registryPath, registry)

const latest = readJson(latestPath, {} as Record<string, any>)
latest[schemaId] = {
  version: nextVersion,
  cid,
  checksum,
  timestamp,
  ...(signed ? { signer: signed.signer, signature: signed.signature, eip712 } : {}),
}
writeJson(latestPath, latest)

const index = readJson(indexPath, {
  schemaId,
  latest: nextVersion,
  published: [] as Array<any>,
})
index.schemaId = schemaId
index.latest = nextVersion
index.published = upsertPublished(index.published, {
  version: nextVersion,
  ...publishedEntry,
})
writeJson(indexPath, index)

console.log(`Published ${schemaId}@${nextVersion}`)
console.log(`CID: ${cid}`)
if (signed) {
  console.log(`Signer: ${signed.signer}`)
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { addEnsContracts } from '@ensdomains/ensjs'
import { type VerifyResult, verifyProof } from '@ensmetadata/sdk'
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { type Address, http, type PublicClient, createPublicClient, isAddress } from 'viem'
import { mainnet } from 'viem/chains'

// Trusted attesters are env-configured. Comma-separated list of EIP-55 hex
// addresses. Empty by default — phase 2 ships an attester address to plug in
// here, until then every verify will fail with `untrusted-attester`.
function readTrustedAttesters(): Address[] {
  const raw = process.env.NEXT_PUBLIC_TRUSTED_ATTESTERS
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => isAddress(s)) as Address[]
}

interface Props {
  params: Promise<{ name: string }>
}

// Reverse-DNS platform identifiers. Adding a platform = append here +
// register a validator on the attester worker.
const PLATFORMS = ['com.x', 'org.telegram'] as const
type Platform = (typeof PLATFORMS)[number]

const PLATFORM_LABELS: Record<Platform, string> = {
  'com.x': 'X',
  'org.telegram': 'Telegram',
}

interface PlatformResult {
  platform: Platform
  result: VerifyResult
}

function formatExpiry(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function reasonLabel(reason: VerifyResult['reason']): string {
  switch (reason) {
    case 'missing':
      return 'No proof set'
    case 'expired':
      return 'Proof expired'
    case 'bad-signature':
      return 'Signature does not verify'
    case 'wrong-owner':
      return 'Observed wallet is no longer the ENS owner'
    case 'untrusted-attester':
      return 'Attester is not in the trusted set'
    case 'unsupported-version':
      return 'Claim uses an unsupported schema version'
    case 'handle-changed':
      return 'Handle changed since signing'
    case 'decode-error':
      return 'Proof bytes are malformed'
    default:
      return 'Invalid'
  }
}

export default async function ProofsPage({ params }: Props) {
  const { name } = await params
  const decoded = decodeURIComponent(name)

  const client = createPublicClient({
    chain: addEnsContracts(mainnet),
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  }) as unknown as PublicClient

  const verifierConfig = { trustedAttesters: readTrustedAttesters() }

  const results: PlatformResult[] = await Promise.all(
    PLATFORMS.map(async (platform) => ({
      platform,
      result: await verifyProof(client, verifierConfig, { name: decoded, platform }),
    })),
  )

  const anyFound = results.some((r) => r.result.reason !== 'missing')

  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <div className="max-w-xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Proofs for {decoded}</CardTitle>
            <CardDescription>Verifiable social proofs attached to this ENS name.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!anyFound && (
              <div className="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No proofs found for <span className="font-mono">{decoded}</span>.
              </div>
            )}

            {results.map(({ platform, result }) => {
              if (result.reason === 'missing') return null

              const tone = result.valid
                ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950'
                : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
              const Icon = result.valid ? CheckCircle2 : XCircle
              const iconTone = result.valid
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'

              return (
                <div key={platform} className={`rounded-md border p-4 text-sm ${tone}`}>
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconTone}`} />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{PLATFORM_LABELS[platform]}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          {result.valid ? 'Verified' : reasonLabel(result.reason)}
                        </div>
                      </div>
                      {result.handle && (
                        <div className="flex justify-between gap-4">
                          <span className="text-neutral-500 dark:text-neutral-400">Handle</span>
                          <span className="font-mono">@{result.handle}</span>
                        </div>
                      )}
                      {result.uid && (
                        <div className="flex justify-between gap-4">
                          <span className="text-neutral-500 dark:text-neutral-400">User id</span>
                          <span className="font-mono truncate">{result.uid}</span>
                        </div>
                      )}
                      {result.expiresAt && (
                        <div className="flex justify-between gap-4">
                          <span className="text-neutral-500 dark:text-neutral-400">Expires</span>
                          <span className="font-mono">{formatExpiry(result.expiresAt)}</span>
                        </div>
                      )}
                      {result.cid && (
                        <div className="flex justify-between gap-4">
                          <span className="text-neutral-500 dark:text-neutral-400">Proof doc</span>
                          <a
                            href={
                              result.cid.startsWith('http')
                                ? result.cid
                                : `https://ipfs.io/ipfs/${result.cid.replace(/^ipfs:\/\//, '')}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs truncate max-w-[14rem] underline"
                          >
                            {result.cid.replace(/^https?:\/\//, '').slice(0, 32)}…
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="flex items-start gap-2 text-xs text-neutral-500 dark:text-neutral-400 pt-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Verification checks: claim signature recovers to the ENS owner, claim is unexpired,
                bound to this ENS name and chain. Uses the cheap path (no IPFS fetch).
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

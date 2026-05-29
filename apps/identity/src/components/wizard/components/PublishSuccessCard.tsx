'use client'

import { GuidedCard, GuidedSection } from '@/components/ui/GuidedCard'
import { useWizardStore } from '@/stores/wizard'
import { chainFromName } from '@ensmetadata/shared/chain-from-name'
import { CheckCircle2, ExternalLink } from 'lucide-react'

interface Props {
  txHash: string | null
}

/** Terminal success state after a confirmed publish. Shows the tx hash and
 *  links out to the explorer for the chain the name lives on (Basescan for
 *  `*.base.eth`, Etherscan otherwise). */
export function PublishSuccessCard({ txHash }: Props) {
  const ensName = useWizardStore((s) => s.ensName)
  const chain = ensName ? chainFromName(ensName) : null
  const explorerUrl = txHash && chain ? `${chain.explorerTxBase}${txHash}` : null
  const explorerLabel = chain?.name === 'base' ? 'Basescan' : 'Etherscan'

  return (
    <div className="space-y-6">
      <GuidedCard>
        <GuidedSection
          number="✓"
          title="Records published"
          description={`Updates written to ${ensName}.`}
          active
          accent="green"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <div className="font-medium">Transaction confirmed</div>
                {txHash && <div className="font-mono text-xs break-all">{txHash}</div>}
              </div>
            </div>
            {explorerUrl && (
              <div className="flex flex-wrap gap-2">
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  {explorerLabel}
                </a>
              </div>
            )}
          </div>
        </GuidedSection>
      </GuidedCard>
    </div>
  )
}

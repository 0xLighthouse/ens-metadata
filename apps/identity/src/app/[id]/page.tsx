import { Wizard } from '@/components/wizard/Wizard'
import { WizardErrorCard } from '@/components/wizard/WizardErrorCard'
import { AttesterError, type IntentResponse, getIntent } from '@/lib/attester-client'
import { type FetchedSchema, buildKeyLabels, resolveSchemas } from '@/lib/schema-resolver'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function IntentWizardPage({ params }: Props) {
  const { id } = await params

  let intent: IntentResponse
  try {
    intent = await getIntent(id)
  } catch (err) {
    if (err instanceof AttesterError && err.message === 'not_found') notFound()
    throw err
  }

  const config = intent.config

  let schema: FetchedSchema | null = null
  let schemaError: string | null = null
  try {
    schema = await resolveSchemas(config.schemaUris, [...config.required, ...config.optional])
  } catch (err) {
    schemaError = err instanceof Error ? err.message : String(err)
  }

  const keyLabels = buildKeyLabels(schema, config)

  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <header className="mx-auto mb-10 max-w-3xl text-center">
        <h1 className="text-h1 mb-3">Complete your profile</h1>
        {!schemaError && !config.message && (
          <p className="text-body inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-neutral-500 dark:text-neutral-400">
            {intent.creator.avatar ? (
              <img
                src={intent.creator.avatar}
                alt={`${intent.creator.ensName} avatar`}
                className="h-6 w-6 rounded-full border border-neutral-200 object-cover dark:border-neutral-700"
              />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-xs font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                {intent.creator.ensName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
              {intent.creator.ensName}
            </span>
            <span>requests the following details to be present on your ENS profile.</span>
          </p>
        )}
      </header>

      {schemaError ? (
        <WizardErrorCard
          title="Schema error"
          description={
            <>
              The link you followed points at a schema document that we couldn&apos;t use, so the
              wizard can&apos;t start. The on-chain <span className="font-mono">schema</span> text
              record would otherwise be written pointing at this URI, so we&apos;re refusing
              up-front rather than letting the submission compromise itself.
            </>
          }
          detail={
            <>
              <div className="break-words font-medium">{schemaError}</div>
              <div className="text-xs">
                Schema URI:{' '}
                <span className="break-all font-mono">{config.schemaUris.join(', ')}</span>
              </div>
            </>
          }
          hint="Talk to whoever sent you the link — the agent or tool generating these URLs probably has a typo or a stale schema reference."
        />
      ) : (
        <Wizard key={id} intentId={id} intent={intent} schema={schema} keyLabels={keyLabels} />
      )}
    </main>
  )
}

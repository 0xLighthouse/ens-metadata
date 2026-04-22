import { Wizard } from '@/components/wizard/Wizard'
import { AttesterError, type IntentResponse, getIntent } from '@/lib/attester-client'
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

  console.log('intent', intent)

  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <header className="mx-auto mb-10 max-w-3xl text-center">
        <h1 className="text-h1 mb-3">Complete your profile</h1>
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
      </header>
      <Wizard intentId={id} intent={intent} />
    </main>
  )
}

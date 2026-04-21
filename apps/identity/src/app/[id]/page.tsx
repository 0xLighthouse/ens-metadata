import { Wizard } from '@/components/wizard/Wizard'

interface Props {
  params: Promise<{ id: string }>
}

export default async function IntentWizardPage({ params }: Props) {
  const { id } = await params
  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <header className="mx-auto mb-10 max-w-3xl text-center">
        <h1 className="text-h1 mb-3">Complete your ENS profile</h1>
        <p className="text-body text-neutral-500 dark:text-neutral-400">
          Develop your on-chain identity by linking accounts and public info to your ENS name.
        </p>
      </header>
      <Wizard intentId={id} />
    </main>
  )
}

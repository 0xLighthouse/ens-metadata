import { Wizard } from '@/components/wizard/Wizard'

export default function HomePage() {
  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <header className="max-w-xl mx-auto mb-10 text-center">
        <h1 className="text-h1 mb-3">Link a proof to your ENS name</h1>
        <p className="text-body text-neutral-500 dark:text-neutral-400">
          Attach a verifiable Twitter proof to your ENS name. One-shot wizard, one text record, no
          lock-in.
        </p>
      </header>
      <Wizard />
    </main>
  )
}

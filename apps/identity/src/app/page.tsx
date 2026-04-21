import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <header className="max-w-xl mx-auto mb-10 text-center">
        <h1 className="text-h1 mb-3">ENS Metadata Link</h1>
        <p className="text-body text-neutral-500 dark:text-neutral-400">
          To fill our your profile, follow the unique link you received.
        </p>
      </header>
    </main>
  )
}

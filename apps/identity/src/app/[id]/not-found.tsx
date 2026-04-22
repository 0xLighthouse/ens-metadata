import { WizardErrorCard } from '@/components/wizard/WizardErrorCard'

export default function NotFound() {
  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <WizardErrorCard
        title="Intent unavailable"
        description="This intent link is invalid or has been removed."
        hint="Ask whoever sent you this link to generate a new one from the profile builder."
      />
    </main>
  )
}

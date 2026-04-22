import { FormBuilder } from '@/components/builder/FormBuilder'

export default function FormBuilderPage() {
  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <header className="mx-auto mb-10 max-w-3xl text-center">
        <h1 className="text-h1 mb-3">ENS Profile Builder</h1>
        <p className="text-subtitle text-neutral-500 dark:text-neutral-400">
          Define the attributes for your users' public ENS profile, then share the form with them.
        </p>
      </header>
      <div className="mx-auto max-w-3xl">
        <FormBuilder />
      </div>
    </main>
  )
}

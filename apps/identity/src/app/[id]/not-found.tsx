import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function NotFound() {
  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <div className="mx-auto max-w-3xl w-full">
        <Card>
          <CardHeader>
            <CardTitle>Intent unavailable</CardTitle>
            <CardDescription>This intent link is invalid or has been removed.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Ask whoever sent you this link to generate a new one from the profile builder.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">ETHSecurity Badgeholders</h1>
        <p className="text-body-lg text-neutral-500 dark:text-neutral-400">
          Everyone holding the ETHSecurity badge, alongside the ENS metadata they publish on-chain.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>No badgeholders yet</CardTitle>
          <CardDescription>
            This page is a placeholder. It will list each badgeholder and their ENS records once the
            data is wired up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-neutral-500 dark:text-neutral-400">Nothing to show.</p>
        </CardContent>
      </Card>
    </div>
  )
}

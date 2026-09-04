import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { PageInset } from './components/containers'

export default function HomePage() {
  return (
    <PageInset>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h1 className="text-h1">ETHSecurity Badgeholders</h1>
        <p className="text-body-lg text-neutral-500 dark:text-neutral-400">
          Everyone holding the ETHSecurity badge, alongside the ENS metadata they publish on-chain.
        </p>
      </div>

      <Card className="shadow-none">
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
    </PageInset>
  )
}

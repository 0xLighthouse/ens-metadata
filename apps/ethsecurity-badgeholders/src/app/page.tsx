import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { PageInset } from './components/containers'

export default function HomePage() {
  return (
    <PageInset>
      <h1 className="text-2xl font-bold">ETHSecurity Badgeholders</h1>
      <p className="text-body-sm text-neutral-500 dark:text-neutral-400">
        Everyone holding the ETHSecurity badge, alongside the ENS metadata they publish on-chain.
      </p>

      <Card className="mt-3 shadow-none">
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

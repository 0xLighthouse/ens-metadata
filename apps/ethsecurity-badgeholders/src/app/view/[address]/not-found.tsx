import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { PageInset } from '../../components/containers'

export default function BadgeholderNotFound() {
  return (
    <PageInset>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Not a badgeholder</CardTitle>
          <CardDescription>This address does not hold the ETHSecurity badge.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/"
            className="text-neutral-700 text-sm underline hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50"
          >
            Back to all badgeholders
          </Link>
        </CardContent>
      </Card>
    </PageInset>
  )
}

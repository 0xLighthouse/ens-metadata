import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  description: ReactNode
  /** Optional red-highlighted detail block. Free-form so callers can render
   *  inline markup (mono URIs, multi-line messages, etc.) */
  detail?: ReactNode
  /** Small gray hint line rendered under the detail block. */
  hint?: string
}

/**
 * Shared error shell for unusable wizard pages — missing intents, schema
 * fetch failures, etc. Keeps copy conventions consistent so different
 * failure modes look like they belong to the same product.
 */
export function WizardErrorCard({ title, description, detail, hint }: Props) {
  return (
    <div className="mx-auto max-w-3xl w-full">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail && (
            <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <div className="flex-1 space-y-2">{detail}</div>
              </div>
            </div>
          )}
          {hint && <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
        </CardContent>
      </Card>
    </div>
  )
}

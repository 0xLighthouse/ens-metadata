'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'

interface Props {
  /** ENS name being attested — for the description copy only. */
  name: string
  /** Text record keys the agent asked the user to fill in. */
  requestedAttrs: string[]
  /**
   * Pre-set `class` text record value, supplied via the URL. Written
   * automatically alongside the requested attrs; not exposed as a form
   * field because it's meant to be agent-controlled, not user-edited.
   */
  classValue?: string
  /**
   * Pre-set `schema` text record value, supplied via the URL. Same
   * treatment as classValue — written but not edited.
   */
  schemaUri?: string
  onBack: () => void
  onComplete: (records: Record<string, string>) => void
}

export function EnterAttributesStep({
  name,
  requestedAttrs,
  classValue,
  schemaUri,
  onBack,
  onComplete,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(requestedAttrs.map((k) => [k, ''])),
  )

  const handleContinue = () => {
    const records: Record<string, string> = {}
    for (const key of requestedAttrs) {
      const v = values[key]?.trim()
      if (v) records[key] = v
    }
    if (classValue) records.class = classValue
    if (schemaUri) records.schema = schemaUri
    onComplete(records)
  }

  // Hidden records (class, schema) get a small footer note so the user
  // knows extra records will be written even though they're not in the form.
  const hiddenRecords: Array<[string, string]> = []
  if (classValue) hiddenRecords.push(['class', classValue])
  if (schemaUri) hiddenRecords.push(['schema', schemaUri])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile attributes</CardTitle>
        <CardDescription>
          Fill in the records the agent asked for on{' '}
          <span className="font-mono">{name}</span>. Each field maps to one ENS text record;
          everything gets written in a single transaction at the end.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {requestedAttrs.length === 0 && hiddenRecords.length > 0 && (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 text-sm text-neutral-600 dark:text-neutral-400">
            No fields to fill in — the agent only asked to set the structural records below.
          </div>
        )}

        {requestedAttrs.map((key) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`attr-${key}`}>{key}</Label>
            <Input
              id={`attr-${key}`}
              value={values[key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={placeholderFor(key)}
            />
          </div>
        ))}

        {hiddenRecords.length > 0 && (
          <div className="rounded-md border border-dashed border-neutral-200 dark:border-neutral-700 p-3 text-xs">
            <div className="text-neutral-500 dark:text-neutral-400 mb-2">
              Also written automatically:
            </div>
            <dl className="space-y-1">
              {hiddenRecords.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="font-mono text-neutral-500 dark:text-neutral-400">{k}</dt>
                  <dd className="font-mono truncate">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} full>
            Back
          </Button>
          <Button onClick={handleContinue} full>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function placeholderFor(key: string): string {
  switch (key) {
    case 'avatar':
      return 'https://example.com/avatar.png  or  ipfs://...'
    case 'alias':
      return 'Alice Smith'
    case 'description':
      return 'A short bio'
    case 'email':
      return 'alice@example.com'
    case 'url':
      return 'https://alice.example'
    case 'phone':
      return '+1 555 555 5555'
    default:
      return ''
  }
}

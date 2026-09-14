'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { FormErrors, ProfileForm, ProfileTextKey } from '@/lib/profile-records'

const FIELDS: { key: ProfileTextKey; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: 'name', label: 'Name', placeholder: 'How you want to be listed' },
  {
    key: 'description',
    label: 'Description',
    placeholder: 'A sentence or two about you',
    multiline: true,
  },
  { key: 'avatar', label: 'Avatar URL', placeholder: 'https://… or ipfs://…' },
  { key: 'email', label: 'Email', placeholder: 'you@example.com' },
]

/** The four text records as labelled inputs, with the validation error under each. */
export function ProfileFields({
  form,
  errors,
  disabled,
  onChange,
}: {
  form: ProfileForm
  errors: FormErrors
  disabled: boolean
  onChange: (key: ProfileTextKey, value: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {FIELDS.map(({ key, label, placeholder, multiline }) => {
        const id = `profile-${key}`
        const error = errors[key]
        const shared = {
          id,
          value: form[key],
          placeholder,
          disabled,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': error ? `${id}-error` : undefined,
        }
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            {multiline ? (
              <Textarea {...shared} onChange={(event) => onChange(key, event.target.value)} />
            ) : (
              <Input
                {...shared}
                type={key === 'email' ? 'email' : 'text'}
                onChange={(event) => onChange(key, event.target.value)}
              />
            )}
            {error && (
              <p id={`${id}-error`} className="text-red-600 text-xs dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

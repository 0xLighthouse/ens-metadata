'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  type FormErrors,
  PROFILE_TEXT_KEYS,
  type ProfileForm,
  type ProfileTextKey,
} from '@/lib/profile-records'

const FIELDS: Record<ProfileTextKey, { label: string; placeholder: string; multiline?: boolean }> =
  {
    alias: { label: 'Name', placeholder: 'Your real name or display name' },
    description: { label: 'Bio', placeholder: 'A sentence or two about you', multiline: true },
    avatar: { label: 'Avatar URL', placeholder: 'https://… or ipfs://…' },
    email: { label: 'Email', placeholder: 'you@example.com' },
  }

/** The editable text records as labelled inputs, with the validation error under each. */
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
      {PROFILE_TEXT_KEYS.map((key) => {
        const { label, placeholder, multiline } = FIELDS[key]
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

'use client'

import { Label } from '@/components/ui/label'
import { useCallback, useMemo } from 'react'
import { AutoGrowInput } from './AutoGrowInput'
import { HelpTooltip } from './HelpTooltip'

interface ArrayAttributeInputProps {
  baseKey: string
  label: string
  isRequired: boolean
  helpText?: string
  placeholder?: string
  attrsValues: Record<string, string>
  setAttrsValues: (values: Record<string, string>) => void
}

function collectEntries(baseKey: string, attrsValues: Record<string, string>): string[] {
  const values: string[] = []
  for (let i = 0; ; i++) {
    const v = attrsValues[`${baseKey}[${i}]`]
    if (v === undefined) break
    values.push(v)
  }
  return values
}

export function ArrayAttributeInput({
  baseKey,
  label,
  isRequired,
  helpText,
  placeholder,
  attrsValues,
  setAttrsValues,
}: ArrayAttributeInputProps) {
  const entries = useMemo(() => collectEntries(baseKey, attrsValues), [baseKey, attrsValues])

  const slots = useMemo(() => {
    const result = [...entries]
    if (result.length === 0 || result[result.length - 1] !== '') {
      result.push('')
    }
    return result
  }, [entries])

  const handleChange = useCallback(
    (index: number, newValue: string) => {
      const currentValues = collectEntries(baseKey, attrsValues)
      while (currentValues.length <= index) currentValues.push('')
      currentValues[index] = newValue

      if (newValue === '' && index < currentValues.length - 1) {
        currentValues.splice(index, 1)
      }

      const next = { ...attrsValues }
      for (const k of Object.keys(next)) {
        if (k.startsWith(`${baseKey}[`)) delete next[k]
      }
      for (let i = 0; i < currentValues.length; i++) {
        if (currentValues[i] !== '') {
          next[`${baseKey}[${i}]`] = currentValues[i]
        }
      }
      setAttrsValues(next)
    },
    [baseKey, attrsValues, setAttrsValues],
  )

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-2">
        <span>{label}</span>
        {isRequired && (
          <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
            Required
          </span>
        )}
        {helpText && <HelpTooltip text={helpText} />}
      </Label>
      <div className="space-y-2">
        {slots.map((value, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-[0.4375rem] shrink-0 text-xs font-mono text-neutral-400 dark:text-neutral-500 w-8 text-right">
              [{i}]
            </span>
            <AutoGrowInput
              id={`attr-${baseKey}-${i}`}
              value={value}
              onChange={(e) => handleChange(i, e.target.value)}
              placeholder={i === 0 ? placeholder : undefined}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-required={isRequired && i === 0}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

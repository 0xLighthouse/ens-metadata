'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { useVerifyEns } from '@/hooks/use-verify-ens'
import { useState } from 'react'

interface Props {
  ens: ReturnType<typeof useVerifyEns>
  disabled: boolean
}

/** Draft ENS name input + owned-names autocomplete + Confirm button. */
export function EnsVerification({ ens, disabled }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const inFlight = ens.phase !== 'idle'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        ens.verify()
      }}
      className="space-y-2"
    >
      <Label htmlFor="ens-name">ENS name</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="ens-name"
            placeholder="alice.eth"
            value={ens.draftName}
            onChange={(e) => {
              ens.setDraftName(e.target.value)
              setDropdownOpen(true)
            }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setDropdownOpen(false)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            disabled={disabled || inFlight}
            role="combobox"
            aria-expanded={dropdownOpen && ens.ownedNames.length > 0}
            aria-autocomplete="list"
          />
          {dropdownOpen && ens.ownedNames.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
            >
              {ens.ownedNames.map((n) => (
                <li key={n} role="option" aria-selected={n === ens.draftName}>
                  <button
                    type="button"
                    // onMouseDown + preventDefault keeps the input focused so
                    // onBlur doesn't close the dropdown before the selection
                    // registers.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      ens.setDraftName(n)
                      setDropdownOpen(false)
                    }}
                    className="block w-full truncate px-3 py-1.5 text-left font-mono text-sm text-neutral-900 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
                  >
                    {n}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button
          type="submit"
          disabled={disabled || !ens.draftName.trim() || inFlight}
          isLoading={inFlight}
        >
          {ens.phase === 'checking-owner'
            ? 'Checking…'
            : ens.phase === 'creating-session'
              ? 'Opening…'
              : 'Confirm'}
        </Button>
      </div>
    </form>
  )
}

'use client'

interface Props {
  ensName: string
  avatar: string | null
  message: string
}

export function CreatorBanner({ ensName, avatar, message }: Props) {
  const initial = ensName.charAt(0).toUpperCase()
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="shrink-0">
        {avatar ? (
          <img
            src={avatar}
            alt={`${ensName} avatar`}
            className="h-10 w-10 rounded-full border border-neutral-200 object-cover dark:border-neutral-700"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {initial}
          </div>
        )}
      </div>
      <div className="flex-1 space-y-1">
        <div className="text-sm">
          <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
            {ensName}
          </span>
          <span className="text-neutral-500 dark:text-neutral-400"> says...</span>
        </div>
        {message && (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{message}</p>
        )}
      </div>
    </div>
  )
}

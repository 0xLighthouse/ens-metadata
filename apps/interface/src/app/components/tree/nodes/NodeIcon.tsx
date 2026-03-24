import { Plus } from 'lucide-react'

interface NodeIconProps {
  avatarUrl?: string | null
  fallback: React.ReactNode
  accentColor: string
  size?: number
  isSuggested?: boolean
}

export function NodeIcon({
  avatarUrl,
  fallback,
  accentColor,
  size = 48,
  isSuggested = false,
}: NodeIconProps) {
  const roundedClass = size >= 48 ? 'rounded-lg' : 'rounded-md'

  if (avatarUrl && !isSuggested) {
    return (
      <div
        className={`flex items-center justify-center ${roundedClass} flex-shrink-0 overflow-hidden`}
        style={{ width: size, height: size }}
      >
        <img
          src={avatarUrl}
          alt="Node avatar"
          style={{
            width: size,
            height: size,
            objectFit: 'cover',
          }}
        />
      </div>
    )
  }

  const iconSize = Math.round(size * 0.6)

  return (
    <div
      className={`flex items-center justify-center ${roundedClass} flex-shrink-0`}
      style={{
        width: size,
        height: size,
        backgroundColor: isSuggested ? '#e2e8f0' : accentColor,
      }}
    >
      {isSuggested ? <Plus size={iconSize} color="#64748b" strokeWidth={2} /> : fallback}
    </div>
  )
}

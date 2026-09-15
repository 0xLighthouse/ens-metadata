import { VerifiedIcon } from '@/components/icons/verified'
import { cn } from '@/lib/utils'

/**
 * The verified checkmark shown after a badgeholder's name. The caller decides whether the profile
 * is verified and sizes the mark via `className`.
 */
export const VerifiedMark = ({ className }: { className?: string }) => (
  <>
    <VerifiedIcon className={cn('shrink-0 text-verified', className)} />
    <span className="sr-only">Verified</span>
  </>
)

import { fetchBadgeholderAvatar } from '@/lib/avatars'
import { isBadgeholder } from '@/lib/badgeholders'
import { AVATAR_BROWSER_TTL_SECONDS, AVATAR_STALE_TTL_SECONDS } from '@/lib/constants'
import { NextResponse } from 'next/server'

type Props = { params: Promise<{ address: string }> }

/**
 * Rendered on demand: the image is cached by `fetchBadgeholderAvatar`, and the badgeholder set
 * this route checks against must never be baked into the build.
 */
export const dynamic = 'force-dynamic'

/** Nothing but a successful image is worth caching anywhere. */
const ERROR_HEADERS = { 'cache-control': 'no-store' }

/**
 * The cached avatar of one badgeholder.
 *
 * Membership is checked before anything is fetched, so a request for an address that does not hold the badge
 * doesn't cache an unrelated image.
 *
 * Headers are set up to give us control over cache duration.
 */
export async function GET(_request: Request, { params }: Props) {
  const { address } = await params

  if (!(await isBadgeholder(address))) {
    return NextResponse.json(
      { error: 'not a badgeholder' },
      { status: 404, headers: ERROR_HEADERS },
    )
  }

  try {
    const { body, contentType } = await fetchBadgeholderAvatar(address)
    return new NextResponse(body, {
      headers: {
        'content-type': contentType,
        'cache-control': `public, max-age=${AVATAR_BROWSER_TTL_SECONDS}, stale-while-revalidate=${AVATAR_STALE_TTL_SECONDS}`,
        'cdn-cache-control': 'no-store',
        'vercel-cdn-cache-control': 'no-store',
      },
    })
  } catch (error) {
    console.error(`Failed to fetch the avatar for ${address} from stamp.fyi`, error)
    return NextResponse.json(
      { error: 'avatar unavailable' },
      { status: 502, headers: ERROR_HEADERS },
    )
  }
}

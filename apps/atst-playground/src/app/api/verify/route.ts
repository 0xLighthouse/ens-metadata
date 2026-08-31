import type { VerifyRequest } from '@/lib/trace'
import { runVerification } from '@/lib/verify-steps'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<VerifyRequest>

  if (!body.name || !body.platform || !body.attester) {
    return NextResponse.json({ error: 'name, platform and attester are required' }, { status: 400 })
  }

  const trace = await runVerification({
    name: body.name,
    platform: body.platform,
    attester: body.attester,
    mode: body.mode === 'uid' ? 'uid' : 'handle',
    uid: body.uid,
  })

  return NextResponse.json(trace)
}

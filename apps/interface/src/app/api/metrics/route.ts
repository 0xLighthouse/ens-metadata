import { DuneClient } from '@duneanalytics/client-sdk'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const dune = new DuneClient(process.env.DUNE_API_KEY!)
    const result = await dune.getLatestResult({ queryId: 6710900 })
    const rows = (result.result?.rows ?? []) as { class: string; counts: number }[]
    return NextResponse.json(rows)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { notifyPartnersForLead } from '@/lib/telegram'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supplied = req.headers.get('x-crm-internal-key')
  if (!secret || !supplied || supplied !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const leadId = String(body?.leadId || '')
  if (!leadId) return NextResponse.json({ ok: false, error: 'leadId is required' }, { status: 400 })

  try {
    await notifyPartnersForLead(leadId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram lead notification failed', error)
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Telegram notification failed' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'

function xmlEscape(value: string) {
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')
}

async function handle(request: Request) {
  const url = new URL(request.url)
  const params = request.method === 'POST' ? await request.formData() : url.searchParams
  const direction = String(params.get('Direction') || '').toLowerCase()
  const to = String(params.get('To') || '')
  const callerId = process.env.PLIVO_NUMBER || ''
  const browserEndpoints = (process.env.PLIVO_BROWSER_ENDPOINTS || process.env.PLIVO_BROWSER_SIP_URI || '')
    .split(',').map(x=>x.trim()).filter(Boolean)

  let body = ''
  if (direction === 'outbound') {
    // Browser/SIP endpoint initiated the call; connect it to the requested PSTN number.
    body = `<Dial callerId="${xmlEscape(callerId)}"><Number>${xmlEscape(to)}</Number></Dial>`
  } else if (browserEndpoints.length) {
    // Incoming call to the Plivo number: ring every configured browser/SIP endpoint.
    body = `<Dial callerId="${xmlEscape(callerId)}">${browserEndpoints.map(uri=>`<User>${xmlEscape(uri)}</User>`).join('')}</Dial>`
  } else {
    body = '<Speak>No browser agent is currently configured. Please try again later.</Speak><Hangup/>'
  }

  return new NextResponse(`<Response>${body}</Response>`, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }

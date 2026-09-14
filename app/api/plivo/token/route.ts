import { NextResponse } from 'next/server'

export async function POST() {
  const authId = process.env.PLIVO_AUTH_ID
  const authToken = process.env.PLIVO_AUTH_TOKEN
  const endpoint = process.env.PLIVO_ENDPOINT_USERNAME
  const appId = process.env.PLIVO_APPLICATION_ID

  if (!authId || !authToken || !endpoint || !appId) {
    return NextResponse.json({
      error: 'Plivo is not configured. Set PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, PLIVO_ENDPOINT_USERNAME and PLIVO_APPLICATION_ID in Vercel environment variables.'
    }, { status: 503 })
  }

  const now = Math.floor(Date.now() / 1000)
  const auth = Buffer.from(`${authId}:${authToken}`).toString('base64')
  const response = await fetch(`https://api.plivo.com/v1/Account/${authId}/JWT/Token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      iss: authId,
      sub: endpoint,
      nbf: now,
      exp: now + 300,
      per: { voice: { incoming_allow: true, outgoing_allow: true } },
      app: appId,
    }),
    cache: 'no-store',
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.token) {
    return NextResponse.json({ error: data.error || data.message || 'Plivo token generation failed' }, { status: 502 })
  }

  return NextResponse.json({ token: data.token })
}

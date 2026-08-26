import { NextResponse, type NextRequest } from 'next/server'

// Authentication is handled by the browser-side Supabase client.
// Keep the Next.js proxy free of Supabase server credentials so production
// deployments do not fail when middleware environment variables are unavailable.
export function proxy(request: NextRequest) {
  return NextResponse.next({ request })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

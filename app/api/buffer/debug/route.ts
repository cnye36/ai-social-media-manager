import { NextResponse } from 'next/server'

// GET /api/buffer/debug?companyId=xxx
// Disabled because the old MCP diagnostic made many Buffer API calls per request.
export async function GET() {
  return NextResponse.json(
    { error: 'Buffer debug route disabled to protect API rate limits.' },
    { status: 410 }
  )
}

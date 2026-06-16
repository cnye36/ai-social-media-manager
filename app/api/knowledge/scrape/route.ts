import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { scrapeWebsite } from '@/lib/rag/scraper'
import { ingestPages } from '@/lib/rag/ingest'

// Allow up to 60s on Vercel Hobby; upgrade to Pro for longer crawls
export const maxDuration = 120

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { companyId, url } = body

  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  if (!url?.trim()) return NextResponse.json({ error: 'url required' }, { status: 400 })

  let normalizedUrl: string
  try {
    normalizedUrl = new URL(url.trim()).href
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  // Verify ownership
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .single()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const admin = createAdminClient()

  // Create job record
  const { data: job, error: jobError } = await admin
    .from('scrape_jobs')
    .insert({
      company_id: companyId,
      url: normalizedUrl,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 })

  // Run the scrape after the response is sent — `after` keeps the function
  // instance alive on Vercel so the crawl isn't cut off mid-batch
  after(() => runScrapeJob(job.id, companyId, normalizedUrl))

  return NextResponse.json({ jobId: job.id }, { status: 202 })
}

async function runScrapeJob(jobId: string, companyId: string, url: string) {
  const admin = createAdminClient()

  try {
    let pagesScraped = 0

    const pages = await scrapeWebsite(url, async (count) => {
      pagesScraped = count
      await admin
        .from('scrape_jobs')
        .update({ pages_scraped: count })
        .eq('id', jobId)
    })

    await ingestPages(companyId, pages, 'website')

    await admin
      .from('scrape_jobs')
      .update({
        status: 'done',
        pages_scraped: pages.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await admin
      .from('scrape_jobs')
      .update({
        status: 'error',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  }
}

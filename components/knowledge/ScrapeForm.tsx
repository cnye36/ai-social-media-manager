'use client'

import { useState, useEffect, useRef } from 'react'
import { Globe, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ScrapeFormProps {
  companyId: string
  onComplete?: () => void
}

type JobState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'running'; jobId: string; pages: number }
  | { phase: 'done'; pages: number }
  | { phase: 'error'; message: string }

export function ScrapeForm({ companyId, onComplete }: ScrapeFormProps) {
  const [url, setUrl] = useState('')
  const [job, setJob] = useState<JobState>({ phase: 'idle' })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setJob({ phase: 'starting' })

    const res = await fetch('/api/knowledge/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, url }),
    })

    const data = await res.json()
    if (!res.ok) {
      setJob({ phase: 'error', message: data.error ?? 'Scrape failed' })
      return
    }

    setJob({ phase: 'running', jobId: data.jobId, pages: 0 })
    pollJob(data.jobId)
  }

  function pollJob(jobId: string) {
    intervalRef.current = setInterval(async () => {
      const res = await fetch(`/api/knowledge/scrape/${jobId}`)
      if (!res.ok) return

      const status = await res.json()

      if (status.status === 'running') {
        setJob({ phase: 'running', jobId, pages: status.pages_scraped ?? 0 })
      } else if (status.status === 'done') {
        clearInterval(intervalRef.current!)
        intervalRef.current = null
        setJob({ phase: 'done', pages: status.pages_scraped ?? 0 })
        setUrl('')
        onComplete?.()
      } else if (status.status === 'error') {
        clearInterval(intervalRef.current!)
        intervalRef.current = null
        setJob({ phase: 'error', message: status.error_message ?? 'Unknown error' })
      }
    }, 2000)
  }

  function reset() {
    setJob({ phase: 'idle' })
  }

  const isRunning = job.phase === 'starting' || job.phase === 'running'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="scrape-url">Website URL</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              id="scrape-url"
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://yourcompany.com"
              className="pl-9"
              disabled={isRunning}
              required
            />
          </div>
          <Button type="submit" disabled={isRunning}>
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scraping...
              </>
            ) : 'Scrape site'}
          </Button>
        </div>
        <p className="text-xs text-zinc-500">
          We'll crawl up to 30 pages and add them to your knowledge base
        </p>
      </div>

      {job.phase === 'running' && (
        <div className="flex items-center gap-3 px-4 py-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
          <Loader2 className="w-4 h-4 text-violet-400 animate-spin flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">Crawling site...</p>
            <p className="text-xs text-zinc-400">{job.pages} pages indexed so far</p>
          </div>
        </div>
      )}

      {job.phase === 'done' && (
        <div className="flex items-center gap-3 px-4 py-3 bg-green-900/20 rounded-lg border border-green-800">
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-white">Done! {job.pages} pages added to your knowledge base</p>
          </div>
          <button type="button" onClick={reset} className="text-xs text-zinc-400 hover:text-white">
            Scrape another
          </button>
        </div>
      )}

      {job.phase === 'error' && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-900/20 rounded-lg border border-red-800">
          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">Scrape failed</p>
            <p className="text-xs text-red-300 truncate">{job.message}</p>
          </div>
          <button type="button" onClick={reset} className="text-xs text-zinc-400 hover:text-white">
            Try again
          </button>
        </div>
      )}
    </form>
  )
}

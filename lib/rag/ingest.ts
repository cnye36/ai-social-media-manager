import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ScrapedPage } from './scraper'

const CHUNK_SIZE = 800   // target tokens (~600 words)
const CHUNK_OVERLAP = 1  // sentences of overlap between chunks
const MIN_CHUNK_LEN = 80 // characters — discard tiny chunks

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Rough token estimate: 1 token ≈ 4 chars
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

function chunkText(text: string): string[] {
  const sentences = splitIntoSentences(text)
  const chunks: string[] = []
  let current: string[] = []
  let currentTokens = 0

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    const sentTokens = estimateTokens(sentence)

    if (currentTokens + sentTokens > CHUNK_SIZE && current.length > 0) {
      const chunk = current.join(' ').trim()
      if (chunk.length >= MIN_CHUNK_LEN) chunks.push(chunk)

      // Overlap: keep last N sentences as start of next chunk
      current = current.slice(-CHUNK_OVERLAP)
      currentTokens = current.reduce((sum, s) => sum + estimateTokens(s), 0)
    }

    current.push(sentence)
    currentTokens += sentTokens
  }

  if (current.length > 0) {
    const chunk = current.join(' ').trim()
    if (chunk.length >= MIN_CHUNK_LEN) chunks.push(chunk)
  }

  return chunks
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  })
  return response.data.map(d => d.embedding)
}

export async function ingestPages(
  companyId: string,
  pages: ScrapedPage[],
  sourceType: 'website' | 'manual' = 'website'
): Promise<number> {
  const supabase = createAdminClient()
  let totalChunks = 0

  // Build all chunks first
  const allChunks: Array<{
    company_id: string
    source_type: string
    source_url: string | null
    title: string | null
    content: string
    metadata: Record<string, unknown>
  }> = []

  for (const page of pages) {
    const chunks = chunkText(page.content)
    for (const chunk of chunks) {
      allChunks.push({
        company_id: companyId,
        source_type: sourceType,
        source_url: page.url || null,
        title: page.title || null,
        content: chunk,
        metadata: { scraped_at: new Date().toISOString() },
      })
    }
  }

  if (allChunks.length === 0) return 0

  // Embed in batches of 100 (OpenAI limit)
  const BATCH_SIZE = 100
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE)
    const embeddings = await embedBatch(batch.map(c => c.content))

    const rows = batch.map((chunk, j) => ({
      ...chunk,
      embedding: JSON.stringify(embeddings[j]),
    }))

    const { error } = await supabase.from('knowledge_chunks').insert(rows)
    if (error) throw new Error(`Ingest failed: ${error.message}`)

    totalChunks += batch.length
  }

  return totalChunks
}

export async function ingestManual(
  companyId: string,
  title: string,
  content: string
): Promise<number> {
  return ingestPages(companyId, [{ url: '', title, content }], 'manual')
}

export async function deleteChunk(chunkId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('knowledge_chunks').delete().eq('id', chunkId)
}

export async function deleteChunksBySource(companyId: string, sourceUrl: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('company_id', companyId)
    .eq('source_url', sourceUrl)
}

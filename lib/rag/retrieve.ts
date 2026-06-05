import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Cache embeddings for the lifetime of a warm server instance.
// Eliminates duplicate API calls when multiple channels generate from the same query.
const embeddingCache = new Map<string, { embedding: number[]; ts: number }>()
const EMBEDDING_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export interface RetrievedChunk {
  id: string
  title: string | null
  content: string
  source_url: string | null
  source_type: string
  similarity: number
}

export async function retrieve(
  companyId: string,
  query: string,
  topK = 5,
  threshold = 0.4
): Promise<RetrievedChunk[]> {
  const cacheKey = query.trim().toLowerCase()
  const cached = embeddingCache.get(cacheKey)
  const now = Date.now()

  let embedding: number[]
  if (cached && now - cached.ts < EMBEDDING_CACHE_TTL) {
    embedding = cached.embedding
  } else {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    })
    embedding = embeddingResponse.data[0]?.embedding ?? []
    if (!embedding.length) throw new Error('OpenAI returned no embedding for the query')
    embeddingCache.set(cacheKey, { embedding, ts: now })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('search_knowledge', {
    p_company_id: companyId,
    p_embedding: JSON.stringify(embedding),
    p_match_count: topK,
    p_threshold: threshold,
  })

  if (error) throw new Error(`Retrieval failed: ${error.message}`)
  return (data ?? []) as RetrievedChunk[]
}

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const embedding = embeddingResponse.data[0].embedding

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

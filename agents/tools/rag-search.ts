import { tool } from '@openai/agents'
import { z } from 'zod'
import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export function buildRagSearchTool(companyId: string) {
  return tool({
    name: 'search_company_knowledge',
    description: 'Search the company knowledge base for relevant information about products, services, team, or company history. Use this when you need specific facts or details.',
    parameters: z.object({
      query: z.string().describe('What to search for in the knowledge base'),
    }),
    execute: async ({ query }) => {
      try {
        const embeddingRes = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: query,
        })
        const embedding = embeddingRes.data[0].embedding

        const supabase = createAdminClient()
        const { data } = await supabase.rpc('search_knowledge', {
          p_company_id: companyId,
          p_embedding: JSON.stringify(embedding),
          p_match_count: 4,
          p_threshold: 0.35,
        })

        if (!data || data.length === 0) {
          return 'No relevant information found in the knowledge base.'
        }

        return data
          .map((chunk: { title?: string; content: string }) =>
            chunk.title ? `[${chunk.title}]\n${chunk.content}` : chunk.content
          )
          .join('\n\n')
      } catch {
        return 'Knowledge base search unavailable.'
      }
    },
  })
}

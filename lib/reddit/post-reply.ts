import { createAdminClient } from '@/lib/supabase/admin'
import { redditApiFetch } from '@/lib/reddit/oauth'

export async function postRedditReply(
  opportunityId: string,
  companyId: string,
): Promise<{ commentId: string }> {
  const supabase = createAdminClient()

  const { data: opp, error } = await supabase
    .from('reddit_opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('company_id', companyId)
    .single()

  if (error || !opp) throw new Error('Opportunity not found')
  if (!opp.draft_reply?.trim()) throw new Error('No draft reply to post')
  if (opp.status === 'replied') throw new Error('Already replied')

  const { data: subConfig } = await supabase
    .from('reddit_subreddit_configs')
    .select('reply_policy')
    .eq('company_id', companyId)
    .eq('subreddit', opp.subreddit)
    .maybeSingle()

  if (subConfig?.reply_policy && subConfig.reply_policy !== 'auto') {
    throw new Error('Auto-reply is not enabled for this subreddit')
  }

  const body = new URLSearchParams({
    api_type: 'json',
    thing_id: opp.reddit_post_id,
    text: opp.draft_reply.trim(),
  })

  const res = await redditApiFetch('/api/comment', companyId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const json = (await res.json()) as {
    json?: { errors?: string[][]; data?: { things?: { data?: { id?: string } }[] } }
  }

  if (!res.ok || json.json?.errors?.length) {
    const errMsg = json.json?.errors?.map(e => e.join(' ')).join('; ') ?? `HTTP ${res.status}`
    throw new Error(`Reddit comment failed: ${errMsg}`)
  }

  const commentId = json.json?.data?.things?.[0]?.data?.id
  if (!commentId) throw new Error('Reddit did not return a comment id')

  await supabase
    .from('reddit_opportunities')
    .update({
      status: 'replied',
      posted_reddit_comment_id: commentId,
    })
    .eq('id', opportunityId)

  return { commentId }
}

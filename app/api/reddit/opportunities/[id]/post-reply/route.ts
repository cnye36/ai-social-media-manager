// TODO: Submit an approved reply to Reddit (auto-eligible subs only).
//
// POST /api/reddit/opportunities/[id]/post-reply
//   Body: { companyId: string }
//   1. Verify user owns companyId
//   2. Load opportunity — must have status = 'drafted' and a draft_reply
//   3. Load reddit_subreddit_configs — abort if reply_policy != 'auto'
//      (client should not show the button, but guard here too)
//   4. Load reddit OAuth tokens for company from reddit_accounts table
//      Auto-refresh token if expired (POST https://www.reddit.com/api/v1/access_token)
//   5. POST to https://oauth.reddit.com/api/comment
//      { thing_id: opportunity.reddit_post_id, text: opportunity.draft_reply }
//   6. Update opportunity: status = 'replied', posted_reddit_comment_id = response.id
//   7. Return { success: true, commentId }

export async function POST() {
  return new Response('Not yet implemented', { status: 501 })
}

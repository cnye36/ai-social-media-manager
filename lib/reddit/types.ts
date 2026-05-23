/** Normalized submission from Reddit listing or /api/info. */
export interface RedditPost {
  id: string
  name: string
  title: string
  selftext: string
  url: string
  author: string
  score: number
  num_comments: number
  subreddit: string
  created_utc: number
  upvote_ratio: number
  link_flair_text: string
  is_self: boolean
  domain: string
  over_18: boolean
  spoiler: boolean
  locked: boolean
  stickied: boolean
}

export function mapListingChild(data: Record<string, unknown>): RedditPost {
  const id = String(data.id ?? '')
  const subreddit = String(data.subreddit ?? '')
  const isSelf = Boolean(data.is_self)
  const permalink = data.permalink
    ? `https://www.reddit.com${String(data.permalink)}`
    : `https://www.reddit.com/r/${subreddit}/comments/${id}/`

  return {
    id,
    name: String(data.name ?? `t3_${id}`),
    title: String(data.title ?? ''),
    selftext: String(data.selftext ?? ''),
    url: isSelf ? permalink : String(data.url ?? permalink),
    author: String(data.author ?? '[deleted]'),
    score: Number(data.score ?? 0),
    num_comments: Number(data.num_comments ?? 0),
    subreddit,
    created_utc: Number(data.created_utc ?? 0),
    upvote_ratio: Number(data.upvote_ratio ?? 0),
    link_flair_text: String(data.link_flair_text ?? ''),
    is_self: isSelf,
    domain: isSelf ? `self.${subreddit}` : String(data.domain ?? ''),
    over_18: Boolean(data.over_18),
    spoiler: Boolean(data.spoiler),
    locked: Boolean(data.locked),
    stickied: Boolean(data.stickied),
  }
}

export function postToOpportunityRow(
  post: RedditPost,
  meta: { company_id: string; monitor_id: string; matched_keywords: string[] },
) {
  return {
    company_id: meta.company_id,
    monitor_id: meta.monitor_id,
    reddit_post_id: post.name,
    subreddit: post.subreddit,
    title: post.title,
    selftext: post.selftext,
    url: post.url.startsWith('http')
      ? post.url
      : `https://reddit.com${post.url.startsWith('/') ? post.url : '/' + post.id}`,
    author: post.author,
    score: post.score,
    num_comments: post.num_comments,
    upvote_ratio: post.upvote_ratio,
    link_flair_text: post.link_flair_text || null,
    is_self: post.is_self,
    domain: post.domain || null,
    matched_keywords: meta.matched_keywords,
    posted_at:
      post.created_utc > 0
        ? new Date(post.created_utc * 1000).toISOString()
        : new Date().toISOString(),
  }
}

export function postToStatsUpdate(post: RedditPost) {
  return {
    score: post.score,
    num_comments: post.num_comments,
    upvote_ratio: post.upvote_ratio,
    link_flair_text: post.link_flair_text || null,
    is_self: post.is_self,
    domain: post.domain || null,
  }
}

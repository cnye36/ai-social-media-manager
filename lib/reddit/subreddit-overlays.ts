/**
 * Curated automod / culture notes for subs where generic "no self-promo" isn't enough.
 * Merged into posting guidance generation and generation prompts.
 */

export interface SubredditOverlay {
  subreddit: string
  /** Appended to AI guidance generation and injected into writer prompts */
  writerBlock: string
}

const AUTOMATION_OVERLAY: SubredditOverlay = {
  subreddit: 'automation',
  writerBlock: `
## r/automation automod (verified — "Such submissions are not allowed")

This sub's submit filter often blocks posts that sound like a **how-to recipe** or **pipeline spec**, even with zero product mentions. It is NOT always self-promo.

### Phrasing that commonly triggers removal
- Ordered matching recipes: "email first, then phone, then fuzzy match on name + company"
- Create/update branching spelled out: "If there's a match, update. If not, create." / "if match update else create"
- "Before creating anything, I check against..." with a field list
- "What's worked best for me" immediately followed by your exact technical process
- Step-by-step dedupe, routing, or CRM sync logic in the body (reads like documentation)

### Safe alternatives (same topic, passes filter)
- One-sentence lesson only: "treating dedupe as its own step saved me" — do NOT explain the step
- Problem + pain only: duplicate contacts, messy Voice AI transcripts, downstream weirdness
- End with questions: "hard key vs confidence score?", "block create vs review queue?" — no algorithm
- Say you dedupe at intake vs per-system without listing fields or if/else rules

### Body structure that works
- Paragraph 1: relatable problem story (messy data, duplicates, cleanup)
- Paragraph 2: vague lesson or frustration (no field order, no if/then)
- Paragraph 3+: genuine questions to the community
`.trim(),
}

const OVERLAYS: SubredditOverlay[] = [AUTOMATION_OVERLAY]

export function getSubredditOverlay(subreddit: string): SubredditOverlay | null {
  const clean = subreddit.replace(/^r\//, '').toLowerCase()
  return OVERLAYS.find(o => o.subreddit === clean) ?? null
}

export function appendSubredditOverlay(guidance: string, subreddit: string): string {
  const overlay = getSubredditOverlay(subreddit)
  if (!overlay) return guidance
  if (guidance.includes('automod (verified')) return guidance
  return guidance ? `${guidance.trim()}\n\n${overlay.writerBlock}` : overlay.writerBlock
}

export interface SubmissionLintIssue {
  id: string
  severity: 'block' | 'warn'
  message: string
  excerpt?: string
  suggestion: string
}

interface LintPattern {
  id: string
  severity: 'block' | 'warn'
  subreddits?: string[]
  regex: RegExp
  message: string
  suggestion: string
}

const LINT_PATTERNS: LintPattern[] = [
  {
    id: 'if-match-update-create',
    severity: 'block',
    subreddits: ['automation'],
    regex: /if\s+(there'?s|there is)\s+a\s+match[^.]{0,80}\b(update|merge)\b[^.]{0,60}\b(if not|else)\b[^.]{0,40}\b(create|insert)/i,
    message: 'If/match/update/create logic reads like a workflow spec and often triggers r/automation automod.',
    suggestion: 'Drop the branching rule. Ask how others handle uncertain matches instead.',
  },
  {
    id: 'if-not-create',
    severity: 'block',
    subreddits: ['automation'],
    regex: /if\s+not,?\s+create\b/i,
    message: '"If not, create" is a common automod trigger on r/automation.',
    suggestion: 'Remove create/update branching entirely from the post body.',
  },
  {
    id: 'field-order-recipe',
    severity: 'block',
    subreddits: ['automation'],
    regex: /(email|phone|name)\s+first,?\s+then\s+(email|phone|name|company)/i,
    message: 'Ordered field-matching recipes often get "submission not allowed" on r/automation.',
    suggestion: 'Keep the duplicate-data problem; do not list which fields you match or in what order.',
  },
  {
    id: 'check-fields-in-order',
    severity: 'block',
    subreddits: ['automation'],
    regex: /check\s+against\s+(a\s+few\s+)?fields\s+in\s+order/i,
    message: 'Explicit "check fields in order" phrasing is flagged on r/automation.',
    suggestion: 'Replace with a vague line like "I try to catch dupes early" with no field list.',
  },
  {
    id: 'fuzzy-match-recipe',
    severity: 'block',
    subreddits: ['automation'],
    regex: /fuzzy\s+match\s+on\s+(name|company)/i,
    message: 'Fuzzy-match implementation detail is often blocked on r/automation.',
    suggestion: 'Mention messy inputs or bad merges without describing the matching approach.',
  },
  {
    id: 'before-creating-check',
    severity: 'warn',
    subreddits: ['automation'],
    regex: /before\s+creating\s+anything,?\s+i\s+(try\s+to\s+)?check/i,
    message: '"Before creating anything, I check…" starts a procedural block that automod may reject.',
    suggestion: 'Lead with the pain (duplicates, cleanup) and questions; skip the pre-create checklist.',
  },
  {
    id: 'worked-best-process',
    severity: 'warn',
    subreddits: ['automation'],
    regex: /what'?s\s+worked\s+best\s+for\s+me[^.]{0,120}(first|then|check|match|create|update)/i,
    message: '"What\'s worked best for me" plus process steps is a risky combo on r/automation.',
    suggestion: 'Use a one-line lesson with no following how-to, or only ask what worked for others.',
  },
]

function excerptAround(text: string, index: number, len = 120): string {
  const start = Math.max(0, index - 40)
  const end = Math.min(text.length, index + len)
  const slice = text.slice(start, end).trim()
  return (start > 0 ? '…' : '') + slice + (end < text.length ? '…' : '')
}

export function lintRedditSubmission(
  body: string,
  subreddit?: string | null,
): SubmissionLintIssue[] {
  const cleanSub = subreddit?.replace(/^r\//, '').toLowerCase()
  const text = body.trim()
  if (!text) return []

  const issues: SubmissionLintIssue[] = []
  const seen = new Set<string>()

  for (const pattern of LINT_PATTERNS) {
    if (pattern.subreddits && cleanSub && !pattern.subreddits.includes(cleanSub)) continue
    if (pattern.subreddits && !cleanSub) continue

    const match = pattern.regex.exec(text)
    if (!match || seen.has(pattern.id)) continue
    seen.add(pattern.id)
    issues.push({
      id: pattern.id,
      severity: pattern.severity,
      message: pattern.message,
      excerpt: excerptAround(text, match.index),
      suggestion: pattern.suggestion,
    })
  }

  return issues.sort((a, b) => (a.severity === 'block' ? 0 : 1) - (b.severity === 'block' ? 0 : 1))
}

export function hasBlockingLintIssues(issues: SubmissionLintIssue[]): boolean {
  return issues.some(i => i.severity === 'block')
}

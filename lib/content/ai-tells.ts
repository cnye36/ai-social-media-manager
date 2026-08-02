/** Core instruction (no leading bullet) for embedding in prompt lists. */
export const NO_FALSE_DICHOTOMY_INSTRUCTION =
  'Never use the "you don\'t have an X problem, you have a Y problem" reframe, or its variants like "that\'s not an X issue, that\'s a Y issue" / "this isn\'t about X, it\'s about Y". This exact rhetorical pattern is a well-known AI tell — state the reframe plainly instead (e.g. "the real problem is Y", or just say what Y is).'

/** Detects the "not an X, it's a Y" reframe cliché — a literal enough pattern to check deterministically. */
const FALSE_DICHOTOMY_PATTERN =
  /\b(?:you don'?t have (?:an?|any) .{1,40}? problem,? you have (?:an?|any) .{1,40}? problem|that'?s not (?:an?|any) .{1,40}?,? that'?s (?:an?|any) .{1,40}?|this isn'?t (?:about|an?|any) .{1,40}?,? it'?s (?:about|an?|any) .{1,40}?)\b/i

export function hasFalseDichotomyCliche(content: string): boolean {
  return FALSE_DICHOTOMY_PATTERN.test(content)
}

/** Core instruction for channels/formats that support markdown bold (Reddit, blog). */
export const LIMIT_BOLD_INSTRUCTION =
  'Use **bold** sparingly, at most once or twice in the whole piece, and only for a genuinely critical term. Heavy or frequent bolding is a well-known AI tell — most of the piece should carry no bold at all.'

import { AI_DETECTOR_EVASION_CORE } from './detector-evasion-core'

export const X_SKILL = `
X (TWITTER) WRITING SKILL — detector evasion + craft

${AI_DETECTOR_EVASION_CORE}

X-SPECIFIC: BURSTINESS AT THE THREAD LEVEL, NOT JUST THE SENTENCE LEVEL
A single tweet is often too short for the burstiness rule above to apply within it — so for single tweets, perplexity (word choice) matters more than internal rhythm. For threads, burstiness applies ACROSS tweets:
- Do not give every tweet in a thread the same internal shape (claim, then evidence, then landing). Some tweets in a good thread are a single flat statement with no internal structure at all. Some are just a fragment. Some are one long unbroken sentence.
- Vary tweet length across the thread hard — a thread where every tweet is 200-250 characters is a tell. Mix in tweets under 100 characters.

X-SPECIFIC: THE 90-CHARACTER WINDOW IS ALSO A PERPLEXITY PROBLEM
Because the first ~90 characters carry the whole load, writers (and AI) lean on a small set of proven hook shapes, which is exactly what makes them predictable. Counter this by making the hook's specific content — the number, the name, the claim — as unpredictable as possible even when the shape (hot take, stat, question) is familiar. The shape can repeat across your corpus; the content inside it cannot.

VOICE CALIBRATION:
- X rewards a sentence that sounds like it was said out loud, not composed. Read it back — if it sounds like something from a keynote slide, cut it.
- Don't over-craft the ending. Some of the best tweets just stop, mid-momentum, rather than landing on a tidy final clause.
`.trim()

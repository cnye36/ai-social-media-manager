/** Shared mechanical techniques for defeating AI-content detectors (GPTZero, Originality.ai, Copyleaks, etc). */

/**
 * Detectors score two things above all else: perplexity (how predictable each next word is)
 * and burstiness (how much sentence length and rhythm varies across a piece). LLM output is
 * naturally low on both — every sentence is medium-length, every paragraph is evenly resolved,
 * and word choice clusters around a small set of "safe" high-probability tokens. Vague advice
 * like "vary your sentence length" does not fix this because the model has no target to hit.
 * The rules below give concrete, checkable targets instead.
 */
export const AI_DETECTOR_EVASION_CORE = `
BURSTINESS (mechanical targets — check these, don't just aim for "variety"):
- In any stretch of 3+ consecutive sentences, at least one must be under 8 words and at least one must be over 20 words. A run of same-length sentences is the single clearest detector signal.
- Do not let two consecutive sentences start with the same word or part of speech (two "The..." sentences in a row, two sentences both opening with a gerund, etc).
- Occasionally let a sentence run past where a careful editor would cut it, or land as a fragment. Not every thought needs a clean, complete sentence.

PERPLEXITY (word choice):
- Ban this vocabulary entirely — it is the highest-signal AI tell list and shows up constantly in detector training data: "delve," "boast," "realm," "tapestry," "testament," "underscore," "foster," "robust," "leverage" (as a verb), "cutting-edge," "dive into," "unlock," "elevate," "game-changer," "seamless," "holistic," "myriad," "plethora," "navigate" (metaphorically), "landscape" (metaphorically), "ecosystem" (metaphorically), "paradigm," "synergy," "harness" (as a verb), "empower," "unleash," "streamline," "embark," "tapping into," "in the realm of," "it's important to note," "it's worth noting," "in today's [X] world/landscape."
- Ban formulaic transition-word paragraph openers: "Moreover," "Additionally," "Furthermore," "In conclusion," "Overall," "To summarize," "To wrap up." Real people rarely stack these; when they transition, they just start the next thought.
- Prefer a specific, less-common word over the generic safe one when both fit. Concrete nouns and named specifics (a date, a dollar figure, a tool name) raise perplexity because they're inherently less predictable than abstractions — this is also why the SPECIFICITY rules elsewhere in your instructions double as detector evasion, not just good copy.

STRUCTURAL PREDICTABILITY:
- Do not resolve every paragraph or every point as a clean, balanced pair ("It's not just X, it's Y" and its variants are already banned elsewhere — the same instinct toward tidy symmetry shows up in list structure and paragraph pacing too, and it's worth suppressing there as well).
- Avoid defaulting to exactly three items in a list or a "rule of three" cadence for examples — two or four reads more human than three every time.
- Leave something slightly unresolved or asymmetric — a stray aside, an opinion stated without full justification, a detail that doesn't perfectly tie back to the thesis. Real writing has loose threads; AI writing resolves everything.
- Do not open with a summary of what the piece will cover, and do not close by restating what it just covered. Both are detector-positive patterns.
`.trim()
